import { getModel } from '@shared/models'
import type { ModelInterface } from '@shared/models/types'
import type { Message, Settings } from '@shared/types'
import { ModelProviderEnum } from '@shared/types'
import type { ModelDependencies } from '@shared/types/adapters'
import { getModelSettings } from '@shared/utils/model_settings'
import type { ModelMessage } from 'ai'
import pMap from 'p-map'
import { createModelDependencies } from '@/adapters'
import * as settingActions from '@/stores/settingActions'

/**
 * Resolve the OCR model based on license key and user settings.
 * Returns null if no OCR model is available (caller decides how to handle).
 */
export function getOCRModel(
  globalSettings: Settings,
  configs: { uuid: string },
  dependencies: ModelDependencies
): ModelInterface | null {
  const licenseKey = settingActions.getLicenseKey()
  if (!licenseKey && !(globalSettings.ocrModel?.provider && globalSettings.ocrModel?.model)) {
    return null
  }
  if (globalSettings.licenseKey) {
    const modelSettings = getModelSettings(globalSettings, ModelProviderEnum.ChatboxAI, 'chatbox-ocr-1')
    return getModel(modelSettings, globalSettings, configs, dependencies)
  }
  const ocrModelSetting = globalSettings.ocrModel
  if (!ocrModelSetting?.provider || !ocrModelSetting?.model) {
    return null
  }
  const modelSettings = getModelSettings(globalSettings, ocrModelSetting.provider, ocrModelSetting.model)
  return getModel(modelSettings, globalSettings, configs, dependencies)
}

/**
 * Run OCR on all image parts in messages that don't yet have an ocrResult.
 * Mutates message contentParts in place (sets `ocrResult` on image parts).
 * Uses p-map with concurrency: 3 for parallel OCR processing.
 */
export async function ocrImagesInMessages(messages: Message[], ocrModel: ModelInterface): Promise<void> {
  const imageParts: Array<{ storageKey: string; part: Message['contentParts'][number] & { type: 'image' } }> = []
  for (const msg of messages) {
    for (const part of msg.contentParts) {
      if (part.type === 'image' && !part.ocrResult) {
        imageParts.push({ storageKey: part.storageKey, part })
      }
    }
  }

  if (imageParts.length === 0) return

  const dependencies = await createModelDependencies()

  await pMap(
    imageParts,
    async ({ storageKey, part }) => {
      const imageData = await dependencies.storage.getImage(storageKey)
      if (!imageData) return

      const ocrMsg: ModelMessage = {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              'OCR the following image into Markdown.',
              'Tables should be formatted as HTML.',
              'Do not surround your output with triple backticks.',
            ].join(' '),
          },
          { type: 'image' as const, image: imageData },
        ],
      }
      const chatResult = await ocrModel.chat([ocrMsg], {})
      const text = chatResult.contentParts
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('')

      part.ocrResult = text
    },
    { concurrency: 3 }
  )
}
