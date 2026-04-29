import { buildContext } from '@shared/context'
import { getModel } from '@shared/models'
import { ChatboxAIAPIError } from '@shared/models/errors'
import type { ChatStreamOptions, ModelStreamPart } from '@shared/models/types'
import { ModelProviderEnum, type Message, type MessageContentParts } from '@shared/types'
import { getMessageText, sequenceMessages } from '@shared/utils/message'
import type { ToolSet } from 'ai'
import { t } from 'i18next'
import { createModelDependencies } from '@/adapters'
import * as appleAppStore from '@/packages/apple_app_store'
import { convertToModelMessages, injectModelSystemPrompt } from '@/packages/model-calls/message-utils'
import { estimateTokensFromMessages } from '@/packages/token'
import platform from '@/platform'
import storage from '@/storage'
import { StorageKeyGenerator } from '@/storage/StoreStorage'
import * as chatStore from '../chatStore'
import { settingsStore } from '../settingsStore'
import { uiStore } from '../uiStore'
import { createAttachmentResolver } from './attachment-resolver'
import { applyLegacyToolFallback } from './legacy-tool-fallback'
import { persistStreamingMessage, updateStreamingCache } from './messages'
import { getOCRModel, ocrImagesInMessages } from './ocr-helper'
import { createInitialState, processStreamChunk } from './stream-chunk-processor'
import { buildToolsForSession } from './tools-builder'
import {
  findTargetMessageIndex,
  getSessionWebBrowsing,
  handleGenerationError,
  initializeTargetMessage,
  trackGenerateEvent,
} from './utils'

export async function orchestrateGeneration(
  sessionId: string,
  targetMsg: Message,
  options?: { operationType?: 'send_message' | 'regenerate' }
) {
  const session = await chatStore.getSession(sessionId)
  const settings = await chatStore.getSessionSettings(sessionId)
  const globalSettings = settingsStore.getState().getSettings()
  const configs = await platform.getConfig()

  if (!session || !settings) {
    return
  }

  trackGenerateEvent(sessionId, settings, globalSettings, session.type, options)

  const startTime = Date.now()
  let firstTokenLatency: number | undefined
  const persistInterval = 2000
  let lastPersistTimestamp = Date.now()

  targetMsg = await initializeTargetMessage(targetMsg, settings, globalSettings, session.type)

  await persistStreamingMessage(sessionId, targetMsg)

  const found = findTargetMessageIndex(session, targetMsg.id)
  if (!found) return
  const { messages, index: targetMsgIx } = found

  const controller = new AbortController()

  try {
    const dependencies = await createModelDependencies()
    const model = getModel(settings, globalSettings, configs, dependencies)
    const sessionKnowledgeBaseMap = uiStore.getState().sessionKnowledgeBaseMap
    const knowledgeBase = sessionKnowledgeBaseMap[sessionId]
    const webBrowsing = getSessionWebBrowsing(sessionId, settings.provider)

    const attachmentResolver = createAttachmentResolver()
    let promptMsgs = await buildContext(messages.slice(0, targetMsgIx), {
      attachmentResolver,
      compactionPoints: session.compactionPoints,
      modelSupportToolUseForFile: model.isSupportToolUse('read-file'),
      maxContextMessageCount: settings.maxContextMessageCount,
    })

    const infoParts: MessageContentParts = []

    if (
      !model.isSupportVision() &&
      promptMsgs.some((m) => m.contentParts.some((c) => c.type === 'image' && !c.ocrResult))
    ) {
      const ocrModel = getOCRModel(globalSettings, configs, dependencies)
      if (!ocrModel) {
        throw ChatboxAIAPIError.fromCodeName('model_not_support_image_2', 'model_not_support_image_2')
      }
      await ocrImagesInMessages(promptMsgs, ocrModel)
      infoParts.push({
        type: 'info',
        text: t('Current model {{modelName}} does not support image input, using OCR to process images', {
          modelName: model.modelId,
        }),
      })
    }

    const { promptMsgs: updatedMsgs, fallbackToolCallPart } = await applyLegacyToolFallback({
      model,
      promptMsgs,
      knowledgeBase,
      webBrowsing,
      signal: controller.signal,
    })
    promptMsgs = updatedMsgs

    const { tools, instructions } = await buildToolsForSession(model, {
      webBrowsing,
      knowledgeBase,
      messages: promptMsgs,
    })

    let injectedMessages = injectModelSystemPrompt(
      model.modelId,
      promptMsgs,
      instructions,
      model.isSupportSystemMessage() ? 'system' : 'user'
    )

    if (!model.isSupportSystemMessage()) {
      injectedMessages = injectedMessages.map((m) => ({ ...m, role: m.role === 'system' ? 'user' : m.role }))
    }

    injectedMessages = sequenceMessages(injectedMessages)

    const coreMessages = await convertToModelMessages(injectedMessages, {
      modelSupportVision: model.isSupportVision(),
      preserveReasoning: settings.provider === ModelProviderEnum.DeepSeek,
    })

    targetMsg = {
      ...targetMsg,
      cancel: () => controller.abort(),
    }
    updateStreamingCache(sessionId, targetMsg)

    const chatOptions: ChatStreamOptions = {
      sessionId: session.id,
      signal: controller.signal,
      providerOptions: settings.providerOptions,
      maxSteps: 10,
    }

    if (Object.keys(tools).length > 0) {
      chatOptions.tools = tools as ToolSet
    }

    const stream = model.chatStream(coreMessages, chatOptions) as AsyncGenerator<ModelStreamPart<ToolSet>>

    let processorState = createInitialState(fallbackToolCallPart ? [fallbackToolCallPart] : undefined)

    const streamCallbacks = {
      onFileReceived: async (mediaType: string, base64: string) => {
        const storageKey = StorageKeyGenerator.picture(`${session.id}:${targetMsg.id}`)
        await storage.setBlob(storageKey, `data:${mediaType};base64,${base64}`)
        return storageKey
      },
    }

    for await (const chunk of stream) {
      const result = await processStreamChunk(chunk, processorState, streamCallbacks)
      processorState = result.state

      if (result.skipUpdate) {
        if (result.statusChunk && result.statusChunk.type === 'status') {
          targetMsg = {
            ...targetMsg,
            status: result.statusChunk.status ? [result.statusChunk.status] : [],
          }
          updateStreamingCache(sessionId, targetMsg)
        }
        continue
      }

      const nextMsg: Message = {
        ...targetMsg,
        contentParts: [...infoParts, ...processorState.contentParts],
      }

      const textLength = getMessageText(nextMsg, true, true).length
      if (!firstTokenLatency && textLength > 0) {
        firstTokenLatency = Date.now() - startTime
      }

      targetMsg = {
        ...nextMsg,
        status: textLength > 0 ? [] : nextMsg.status,
        firstTokenLatency,
      }

      const shouldPersist = Date.now() - lastPersistTimestamp >= persistInterval
      if (shouldPersist) {
        void persistStreamingMessage(sessionId, targetMsg)
      } else {
        updateStreamingCache(sessionId, targetMsg)
      }
      if (shouldPersist) {
        lastPersistTimestamp = Date.now()
      }
    }

    for (const part of processorState.contentParts) {
      if (part.type === 'reasoning' && part.startTime && !part.duration) {
        part.duration = Date.now() - part.startTime
      }
    }

    targetMsg = {
      ...targetMsg,
      generating: false,
      cancel: undefined,
      contentParts: [...infoParts, ...processorState.contentParts],
      tokensUsed: targetMsg.tokensUsed ?? estimateTokensFromMessages([...promptMsgs, targetMsg]),
      status: [],
      finishReason: processorState.finishReason,
      usage: processorState.usage,
    }

    await persistStreamingMessage(sessionId, targetMsg, { refreshCounting: true })
    appleAppStore.tickAfterMessageGenerated()
  } catch (err: unknown) {
    if (controller.signal.aborted) {
      targetMsg = {
        ...targetMsg,
        generating: false,
        cancel: undefined,
        status: [],
      }
      await persistStreamingMessage(sessionId, targetMsg, { refreshCounting: true })
      return
    }

    targetMsg = handleGenerationError(err, targetMsg, settings)
    await persistStreamingMessage(sessionId, targetMsg, { refreshCounting: true })
  }
}
