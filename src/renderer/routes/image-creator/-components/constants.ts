export const MAX_REFERENCE_IMAGES = 14

export const HISTORY_PANEL_WIDTH = 280

export const IMAGE_MODEL_FALLBACK_NAMES: Record<string, string> = {
  '': 'GPT Image',
  'gpt-image-1': 'GPT Image 1',
  'gpt-image-1.5': 'GPT Image 1.5',
  'gemini-2.5-flash-image': 'Nano Banana',
  'gemini-3-pro-image-preview': 'Nano Banana Pro',
  'gemini-3-pro-image': 'Nano Banana Pro',
}

export const CHATBOXAI_IMAGE_MODEL_IDS = [
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
  'gemini-3-pro-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3.1-flash-image',
]
export const OPENAI_IMAGE_MODEL_IDS = ['gpt-image-1', 'gpt-image-1.5']
export const GEMINI_IMAGE_MODEL_IDS = [
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
  'gemini-3-pro-image',
  'gemini-3.1-flash-image-preview',
  'gemini-3.1-flash-image',
]

type ImageModelFamily = 'gpt' | 'gemini' | 'default'

const RATIO_OPTIONS: Record<ImageModelFamily, string[]> = {
  gpt: ['auto', '1:1', '3:2', '2:3'],
  gemini: ['auto', '1:1', '3:2', '2:3', '4:3', '3:4', '4:5', '5:4', '16:9', '9:16', '21:9'],
  default: ['auto', '1:1', '3:2', '2:3'],
}

export function getRatioOptionsForModel(modelId: string): string[] {
  switch (modelId) {
    case '':
    case 'gpt-image-1':
    case 'gpt-image-1.5':
      return RATIO_OPTIONS.gpt

    case 'gemini-2.5-flash-image':
    case 'gemini-3-pro-image-preview':
    case 'gemini-3-pro-image':
    case 'gemini-3.1-flash-image-preview':
    case 'gemini-3.1-flash-image':
      return RATIO_OPTIONS.gemini

    default:
      // Check if it's a Gemini-like model by name pattern
      if (modelId.includes('gemini') && modelId.includes('image')) {
        return RATIO_OPTIONS.gemini
      }
      return RATIO_OPTIONS.default
  }
}

export function blobToDataUrl(blob: string): string {
  if (blob.startsWith('data:')) return blob
  if (blob.startsWith('/9j/') || blob.startsWith('\xff\xd8')) {
    return `data:image/jpeg;base64,${blob}`
  }
  return `data:image/png;base64,${blob}`
}

export function getBase64ImageSize(base64: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      resolve({ width: img.width, height: img.height })
    }
    img.onerror = (err) => {
      reject(err)
    }
    img.src = base64
  })
}
