import { ofetch } from 'ofetch'

const EDGEONE_BASE_URL_ENDPOINT = 'https://mcp.edgeone.site/get_base_url'
const BASE_URL_TTL = 60 * 1000

let cachedBaseUrl: { value: string; expiresAt: number } | null = null

function generateInstallationId(length = 8): string {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const array = new Uint8Array(length)
    crypto.getRandomValues(array)
    return Array.from(array)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  }
  const fallback = Array.from({ length }, () => Math.floor(Math.random() * 256))
  return fallback.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function fetchBaseUrl(): Promise<string> {
  const response = await ofetch(EDGEONE_BASE_URL_ENDPOINT)
  const { baseUrl } = typeof response === 'string' ? JSON.parse(response) : response
  if (!baseUrl) {
    throw new Error('EdgeOne base URL is unavailable.')
  }
  cachedBaseUrl = {
    value: baseUrl,
    expiresAt: Date.now() + BASE_URL_TTL,
  }
  return baseUrl
}

export function getEdgeOneBaseUrl(force = false): Promise<string> {
  if (!force && cachedBaseUrl && cachedBaseUrl.expiresAt > Date.now()) {
    return Promise.resolve(cachedBaseUrl.value)
  }
  return fetchBaseUrl()
}

export async function deployHtmlToEdgeOne(value: string): Promise<string> {
  if (!value?.trim()) {
    throw new Error('HTML content is empty, nothing to deploy.')
  }

  const baseUrl = await getEdgeOneBaseUrl()
  const response = await ofetch(baseUrl, {
    method: 'POST',
    headers: {
      'X-Installation-ID': generateInstallationId(),
    },
    body: { value },
  })

  const data = typeof response === 'string' ? JSON.parse(response) : response

  if (data.url) {
    return data.url
  }

  throw new Error(data.error || 'Failed to deploy HTML to EdgeOne Pages.')
}
