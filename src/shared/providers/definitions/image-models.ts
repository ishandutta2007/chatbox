export type ImageModelFamily = 'gemini' | 'openai'

interface ImageModelEntry {
  modelId: string
  displayName: string
  family: ImageModelFamily
  /** Whether this model is available through ChatboxAI provider */
  chatboxai?: boolean
}

const IMAGE_MODEL_REGISTRY: ImageModelEntry[] = [
  { modelId: 'gemini-2.5-flash-image', displayName: 'Nano Banana', family: 'gemini', chatboxai: true },
  { modelId: 'gemini-3-pro-image-preview', displayName: 'Nano Banana Pro', family: 'gemini', chatboxai: true },
  { modelId: 'gemini-3-pro-image', displayName: 'Nano Banana Pro', family: 'gemini', chatboxai: true },
  { modelId: 'gemini-3.1-flash-image-preview', displayName: 'Nano Banana 2', family: 'gemini', chatboxai: true },
  { modelId: 'gemini-3.1-flash-image', displayName: 'Nano Banana 2', family: 'gemini', chatboxai: true },
  { modelId: 'gpt-image-1', displayName: 'GPT Image 1', family: 'openai' },
  { modelId: 'gpt-image-1.5', displayName: 'GPT Image 1.5', family: 'openai' },
  { modelId: 'gpt-image-2', displayName: 'GPT Image 2', family: 'openai', chatboxai: true },
]

export const GEMINI_IMAGE_MODEL_IDS = IMAGE_MODEL_REGISTRY.filter((m) => m.family === 'gemini').map((m) => m.modelId)
export const OPENAI_IMAGE_MODEL_IDS = IMAGE_MODEL_REGISTRY.filter((m) => m.family === 'openai').map((m) => m.modelId)
export const CHATBOXAI_IMAGE_MODEL_IDS = IMAGE_MODEL_REGISTRY.filter((m) => m.chatboxai).map((m) => m.modelId)

export const IMAGE_MODEL_FALLBACK_NAMES: Record<string, string> = {
  'chatboxai-paint': 'Chatbox AI Paint',
  ...Object.fromEntries(IMAGE_MODEL_REGISTRY.map((m) => [m.modelId, m.displayName])),
}

const RATIO_OPTIONS: Record<ImageModelFamily | 'default', string[]> = {
  openai: ['auto', '1:1', '3:2', '2:3'],
  gemini: ['auto', '1:1', '3:2', '2:3', '4:3', '3:4', '4:5', '5:4', '16:9', '9:16', '21:9'],
  default: ['auto', '1:1', '3:2', '2:3'],
}

export function getImageModelFamily(modelId: string): ImageModelFamily | 'default' {
  const entry = IMAGE_MODEL_REGISTRY.find((m) => m.modelId === modelId)
  if (entry) return entry.family
  if (modelId.includes('gemini') && modelId.includes('image')) return 'gemini'
  if (modelId.startsWith('gpt-image')) return 'openai'
  return 'default'
}

export function getRatioOptionsForModel(modelId: string): string[] {
  if (modelId === '') return RATIO_OPTIONS.openai
  return RATIO_OPTIONS[getImageModelFamily(modelId)] ?? RATIO_OPTIONS.default
}
