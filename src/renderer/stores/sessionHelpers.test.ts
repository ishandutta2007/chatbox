import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  blobStore,
  licenseState,
  parserState,
  mockParseFileLocally,
  mockUploadAndCreateUserFile,
  mockSetBlob,
  mockGetBlob,
  mockSetItem,
  mockGetItem,
} = vi.hoisted(() => {
  const blobs = new Map<string, string>()
  const license = { key: 'licensed-key' as string | undefined }
  const parser = { type: 'local' as 'local' | 'chatbox-ai' | 'none' | 'mineru' }

  return {
    blobStore: blobs,
    licenseState: license,
    parserState: parser,
    mockParseFileLocally: vi.fn(),
    mockUploadAndCreateUserFile: vi.fn(),
    mockSetBlob: vi.fn(async (key: string, value: string) => {
      blobs.set(key, value)
    }),
    mockGetBlob: vi.fn(async (key: string) => blobs.get(key) ?? null),
    mockSetItem: vi.fn(async () => undefined),
    mockGetItem: vi.fn(async <T>(_key: string, initialValue: T) => initialValue),
  }
})

vi.mock('@/platform', () => ({
  default: {
    parseFileLocally: mockParseFileLocally,
  },
}))

vi.mock('@/storage', () => ({
  default: {
    getBlob: mockGetBlob,
    setBlob: mockSetBlob,
    getItem: mockGetItem,
    setItem: mockSetItem,
  },
}))

vi.mock('@/packages/remote', () => ({
  uploadAndCreateUserFile: mockUploadAndCreateUserFile,
}))

vi.mock('./settingActions', () => ({
  getLicenseKey: () => licenseState.key,
  isPro: () => Boolean(licenseState.key),
}))

vi.mock('./settingsStore', () => ({
  settingsStore: {
    getState: () => ({
      extension: {
        documentParser: { type: parserState.type },
      },
    }),
  },
  getPlatformDefaultDocumentParser: () => ({ type: 'local' }),
}))

vi.mock('./lastUsedModelStore', () => ({
  lastUsedModelStore: {
    getState: () => ({
      chat: undefined,
    }),
  },
}))

vi.mock('@/packages/token', () => ({
  estimateTokens: (text: string) => text.length,
  getTokenizerType: () => 'default',
}))

vi.mock('@/lib/utils', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('@/lib/format-chat', () => ({
  formatChatAsHtml: vi.fn(),
  formatChatAsMarkdown: vi.fn(),
  formatChatAsTxt: vi.fn(),
}))

vi.mock('@/i18n', () => ({
  default: {},
}))

vi.mock('@/stores/chatStore', () => ({
  getMetaStorage: vi.fn(),
}))

import {
  prepareFileAttachment,
  SESSION_ATTACHMENT_RAG_MAX_PARSED_BYTE_LENGTH,
  SESSION_ATTACHMENT_RAG_PARSED_CONTENT_TOO_LARGE_ERROR,
} from './sessionHelpers'

function createFile(name: string, content = 'binary-content'): File {
  const file = new File([content], name, { type: 'application/pdf', lastModified: 1700000000000 })
  Object.defineProperty(file, 'path', {
    value: `/tmp/${name}`,
    configurable: true,
  })
  return file
}

describe('preprocessFile local parser fallback', () => {
  beforeEach(() => {
    blobStore.clear()
    licenseState.key = 'licensed-key'
    parserState.type = 'local'
    mockParseFileLocally.mockReset()
    mockUploadAndCreateUserFile.mockReset()
    mockSetBlob.mockClear()
    mockGetBlob.mockClear()
    mockSetItem.mockClear()
    mockGetItem.mockClear()
  })

  it('falls back to Chatbox AI when local parsing throws and a license is active', async () => {
    const file = createFile('report.pdf')
    blobStore.set('remote-key', 'remote parsed content')
    mockParseFileLocally.mockRejectedValueOnce(new Error('local failed'))
    mockUploadAndCreateUserFile.mockResolvedValueOnce('remote-key')

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockParseFileLocally).toHaveBeenCalledWith(file)
    expect(mockUploadAndCreateUserFile).toHaveBeenCalledWith('licensed-key', file)
    expect(result.error).toBeUndefined()
    expect(result.content).toBe('remote parsed content')
    expect(result.storageKey).toBe(`file:/tmp/${file.name}-${file.size}-${file.lastModified}`)
  })

  it('falls back to Chatbox AI when local parsing returns empty content and a license is active', async () => {
    const file = createFile('empty.pdf')
    blobStore.set('local-key', '   \n\t')
    blobStore.set('remote-key', 'remote recovered content')
    mockParseFileLocally.mockResolvedValueOnce({ isSupported: true, key: 'local-key' })
    mockUploadAndCreateUserFile.mockResolvedValueOnce('remote-key')

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockParseFileLocally).toHaveBeenCalledWith(file)
    expect(mockUploadAndCreateUserFile).toHaveBeenCalledWith('licensed-key', file)
    expect(result.error).toBeUndefined()
    expect(result.content).toBe('remote recovered content')
  })

  it('falls back to Chatbox AI for text files when local parsing fails', async () => {
    const file = createFile('readme.txt', 'text content')
    blobStore.set('remote-key', 'remote text content')
    mockParseFileLocally.mockRejectedValueOnce(new Error('local failed'))
    mockUploadAndCreateUserFile.mockResolvedValueOnce('remote-key')

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockUploadAndCreateUserFile).toHaveBeenCalledWith('licensed-key', file)
    expect(result.error).toBeUndefined()
    expect(result.content).toBe('remote text content')
  })

  it('keeps local_parser_failed when local parsing throws without a license', async () => {
    const file = createFile('no-license.pdf')
    licenseState.key = undefined
    mockParseFileLocally.mockRejectedValueOnce(new Error('local failed'))

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(mockUploadAndCreateUserFile).not.toHaveBeenCalled()
    expect(result.content).toBe('')
    expect(result.storageKey).toBe('')
    expect(result.error).toBe('local_parser_failed')
  })

  it('blocks documents when parsed text exceeds the session attachment limit', async () => {
    const file = createFile('dense.pdf')
    const parsedContent = 'a'.repeat(SESSION_ATTACHMENT_RAG_MAX_PARSED_BYTE_LENGTH + 1)
    blobStore.set('local-key', parsedContent)
    mockParseFileLocally.mockResolvedValueOnce({ isSupported: true, key: 'local-key' })

    const result = await prepareFileAttachment(file, { provider: '', modelId: '' })

    expect(result.error).toBe(SESSION_ATTACHMENT_RAG_PARSED_CONTENT_TOO_LARGE_ERROR)
    expect(result.sessionAttachmentAvailability).toBe('blocked')
    expect(result.sessionAttachmentBlockedReason).toBe(SESSION_ATTACHMENT_RAG_PARSED_CONTENT_TOO_LARGE_ERROR)
    expect(result.ragMode).toBe('session-retrieval')
    expect(result.byteLength).toBe(SESSION_ATTACHMENT_RAG_MAX_PARSED_BYTE_LENGTH + 1)
  })
})
