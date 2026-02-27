import { Combobox, type ComboboxProps, Divider, Text, useCombobox } from '@mantine/core'
import { type ModelProvider, ModelProviderEnum, ModelProviderType, type ProviderInfo } from '@shared/types'
import { forwardRef, type PropsWithChildren, useMemo } from 'react'
import { useProviders } from '@/hooks/useProviders'

interface ImageModel {
  modelId: string
  displayName: string
}

// model 白名单，与 provider models 取交集，保证只显示支持的模型
const CHATBOXAI_IMAGE_MODEL_IDS = [
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
  'gemini-3-pro-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3.1-flash-image',
]
const OPENAI_IMAGE_MODEL_IDS = ['gpt-image-1', 'gpt-image-1.5']
const GEMINI_IMAGE_MODEL_IDS = [
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
  'gemini-3-pro-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3.1-flash-image',
]

export const CHATBOXAI_DEFAULT_IMAGE_MODEL: ImageModel = {
  modelId: '',
  displayName: 'GPT Image',
}

const IMAGE_MODEL_FALLBACK_NAMES: Record<string, string> = {
  'chatboxai-paint': 'Chatbox AI Paint',
  'gpt-image-1': 'GPT Image 1',
  'gpt-image-1.5': 'GPT Image 1.5',
  'gemini-2.5-flash-image': 'Nano Banana',
  'gemini-3-pro-image-preview': 'Nano Banana Pro',
  'gemini-3-pro-image': 'Nano Banana Pro',
  'gemini-3.1-flash-image-preview': 'Nano Banana 2',
  'gemini-3.1-flash-image': 'Nano Banana 2',
}

function getAvailableImageModels(provider: ProviderInfo, imageModelIds: string[]): ImageModel[] {
  const providerModels = provider.models || provider.defaultSettings?.models || []
  const defaultModels = provider.defaultSettings?.models || []
  return imageModelIds
    .map((modelId) => {
      // Check user's model list first (preserves nickname), then fall back to defaults (picks up newly added models)
      const model =
        providerModels.find((m) => m.modelId === modelId) || defaultModels.find((m) => m.modelId === modelId)
      if (!model) return null
      return {
        modelId,
        displayName: model.nickname || IMAGE_MODEL_FALLBACK_NAMES[modelId] || modelId,
      }
    })
    .filter((m): m is ImageModel => m !== null)
}

export type ImageModelSelectProps = PropsWithChildren<
  {
    onSelect?: (provider: ModelProvider, model: string) => void
  } & ComboboxProps
>

export const ImageModelSelect = forwardRef<HTMLButtonElement, ImageModelSelectProps>(
  ({ onSelect, children, ...comboboxProps }, ref) => {
    const { providers } = useProviders()

    const chatboxAIImageModels = useMemo(() => {
      const provider = providers.find((p) => p.id === ModelProviderEnum.ChatboxAI)
      if (!provider) {
        return []
      }
      return getAvailableImageModels(provider, CHATBOXAI_IMAGE_MODEL_IDS)
    }, [providers])

    const geminiProvider = useMemo(() => {
      const provider = providers.find((p) => p.id === ModelProviderEnum.Gemini)
      if (!provider) return null
      const imageModels = getAvailableImageModels(provider, GEMINI_IMAGE_MODEL_IDS)
      return imageModels.length > 0 ? { provider, imageModels } : null
    }, [providers])

    const openaiProviders = useMemo(() => {
      return providers
        .filter((p) => [ModelProviderEnum.OpenAI, ModelProviderEnum.Azure].includes(p.id as ModelProviderEnum))
        .map((provider) => ({
          provider,
          imageModels: getAvailableImageModels(provider, OPENAI_IMAGE_MODEL_IDS),
        }))
        .filter((item) => item.imageModels.length > 0)
    }, [providers])

    const customGeminiProviders = useMemo(() => {
      return providers
        .filter((p) => p.isCustom && p.type === ModelProviderType.Gemini)
        .map((provider) => ({
          provider,
          imageModels: getAvailableImageModels(provider, GEMINI_IMAGE_MODEL_IDS),
        }))
        .filter((item) => item.imageModels.length > 0)
    }, [providers])

    const combobox = useCombobox({
      onDropdownClose: () => {
        combobox.resetSelectedOption()
        combobox.focusTarget()
      },
    })

    const handleOptionSubmit = (val: string) => {
      const [provider, modelId] = val.split(':')
      onSelect?.(provider as ModelProvider, modelId)
      combobox.closeDropdown()
    }

    return (
      <Combobox
        store={combobox}
        width={280}
        position="top"
        withinPortal={true}
        {...comboboxProps}
        onOptionSubmit={handleOptionSubmit}
      >
        <Combobox.Target targetType="button">
          <button ref={ref} onClick={() => combobox.toggleDropdown()} className="border-none bg-transparent p-0 flex">
            {children}
          </button>
        </Combobox.Target>

        <Combobox.Dropdown className="!rounded-2xl !border-[var(--chatbox-border-primary)] !shadow-lg overflow-hidden">
          <Combobox.Options mah={400} style={{ overflowY: 'auto' }} className="p-1">
            <Combobox.Group
              label="Chatbox AI"
              classNames={{ groupLabel: '!text-xs !font-semibold !uppercase tracking-wide' }}
            >
              <Combobox.Option
                key={`${ModelProviderEnum.ChatboxAI}:${CHATBOXAI_DEFAULT_IMAGE_MODEL.modelId}`}
                value={`${ModelProviderEnum.ChatboxAI}:${CHATBOXAI_DEFAULT_IMAGE_MODEL.modelId}`}
                className="!rounded-lg"
              >
                <Text size="sm">{CHATBOXAI_DEFAULT_IMAGE_MODEL.displayName}</Text>
              </Combobox.Option>
              {chatboxAIImageModels.map((model) => (
                <Combobox.Option
                  key={`${ModelProviderEnum.ChatboxAI}:${model.modelId}`}
                  value={`${ModelProviderEnum.ChatboxAI}:${model.modelId}`}
                  className="!rounded-lg"
                >
                  <Text size="sm">{model.displayName}</Text>
                </Combobox.Option>
              ))}
            </Combobox.Group>

            {geminiProvider && (
              <>
                <Divider my="xs" />
                <Combobox.Group
                  label="Google Gemini"
                  classNames={{ groupLabel: '!text-xs !font-semibold !uppercase tracking-wide' }}
                >
                  {geminiProvider.imageModels.map((model) => (
                    <Combobox.Option
                      key={`${ModelProviderEnum.Gemini}:${model.modelId}`}
                      value={`${ModelProviderEnum.Gemini}:${model.modelId}`}
                      className="!rounded-lg"
                    >
                      <Text size="sm">{model.displayName}</Text>
                    </Combobox.Option>
                  ))}
                </Combobox.Group>
              </>
            )}

            {customGeminiProviders.map(({ provider, imageModels }) => (
              <div key={provider.id}>
                <Divider my="xs" />
                <Combobox.Group
                  label={provider.name}
                  classNames={{ groupLabel: '!text-xs !font-semibold !uppercase tracking-wide' }}
                >
                  {imageModels.map((model) => (
                    <Combobox.Option
                      key={`${provider.id}:${model.modelId}`}
                      value={`${provider.id}:${model.modelId}`}
                      className="!rounded-lg"
                    >
                      <Text size="sm">{model.displayName}</Text>
                    </Combobox.Option>
                  ))}
                </Combobox.Group>
              </div>
            ))}

            {openaiProviders.map(({ provider, imageModels }) => (
              <div key={provider.id}>
                <Divider my="xs" />
                <Combobox.Group
                  label={provider.name}
                  classNames={{ groupLabel: '!text-xs !font-semibold !uppercase tracking-wide' }}
                >
                  {imageModels.map((model) => (
                    <Combobox.Option
                      key={`${provider.id}:${model.modelId}`}
                      value={`${provider.id}:${model.modelId}`}
                      className="!rounded-lg"
                    >
                      <Text size="sm">{model.displayName}</Text>
                    </Combobox.Option>
                  ))}
                </Combobox.Group>
              </div>
            ))}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    )
  }
)

ImageModelSelect.displayName = 'ImageModelSelect'

export default ImageModelSelect
