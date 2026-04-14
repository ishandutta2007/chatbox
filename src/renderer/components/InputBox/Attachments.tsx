import NiceModal from '@ebay/nice-modal-react'
import { Tooltip, Typography } from '@mui/material'
import { ChatboxAIAPIError } from '@shared/models/errors'
import { AlertCircle, CheckCircle, Eye, Link, Link2, Loader2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import MiniButton from '../common/MiniButton'
import FileIcon from '../FileIcon'
import { ImageInStorage } from '../Image'

// 根据错误码获取翻译后的错误消息
function getTranslatedErrorMessage(errorCode: string | undefined, t: (key: string) => string): string | undefined {
  if (!errorCode) return undefined
  const errorDetail = ChatboxAIAPIError.codeNameMap[errorCode]
  if (errorDetail) {
    // 使用 i18nKey 进行翻译，去掉其中的 HTML 标签以便在 Tooltip 中显示纯文本
    const translated = t(errorDetail.i18nKey)
    // 移除 HTML/JSX 标签，只保留纯文本
    return translated.replace(/<[^>]*>/g, '')
  }
  return t('Processing failed')
}

export function ImageMiniCard(props: { storageKey: string; onDelete: () => void }) {
  const { storageKey, onDelete } = props
  return (
    <div
      key={storageKey}
      className="w-[100px] h-[100px] p-1 m-1 inline-flex items-center justify-center
                                bg-white shadow-sm rounded-md border-solid border-gray-400/20
                                hover:shadow-lg hover:cursor-pointer hover:scale-105 transition-all duration-200
                                group/image-mini-card"
    >
      <ImageInStorage storageKey={storageKey} />
      {onDelete && (
        <MiniButton
          className="hidden group-hover/image-mini-card:inline-block
                    absolute top-0 right-0 m-1 p-1 rounded-full shadow-lg bg-white/90 dark:bg-gray-800/90 text-red-500 hover:bg-white dark:hover:bg-gray-800"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 size="22" strokeWidth={2} />
        </MiniButton>
      )}
    </div>
  )
}

export function FileMiniCard(props: {
  name: string
  fileType: string
  onDelete: () => void
  status?: 'processing' | 'completed' | 'error'
  errorMessage?: string
  onErrorClick?: () => void
}) {
  const { name, onDelete, status, errorMessage, onErrorClick } = props
  const { t } = useTranslation()

  const handleClick = () => {
    if (status === 'error' && onErrorClick) {
      onErrorClick()
    }
  }

  // 获取翻译后的错误消息
  const translatedError = getTranslatedErrorMessage(errorMessage, t)

  return (
    <div
      className="w-[100px] h-[100px] p-1 m-1 inline-flex items-center justify-center
                                bg-white shadow-sm rounded-md border-solid border-gray-400/20
                                hover:shadow-lg hover:cursor-pointer hover:scale-105 transition-all duration-200
                                group/file-mini-card relative"
      onClick={handleClick}
    >
      <Tooltip title={status === 'error' && translatedError ? translatedError : name}>
        <div className="flex flex-col justify-center items-center">
          <FileIcon filename={name} className="w-8 h-8 text-black" />
          <Typography className="w-20 pt-1 text-black text-center" noWrap sx={{ fontSize: '12px' }}>
            {name}
          </Typography>
        </div>
      </Tooltip>

      {/* Status indicator */}
      {status && (
        <div className="absolute bottom-1 left-1">
          {status === 'processing' && <Loader2 size="16" className="animate-spin text-blue-500" />}
          {status === 'completed' && <CheckCircle size="16" className="text-green-500" />}
          {status === 'error' && <AlertCircle size="16" className="text-red-500" />}
        </div>
      )}

      {onDelete && (
        <MiniButton
          className="hidden group-hover/file-mini-card:inline-block
                    absolute top-0 right-0 m-1 p-1 rounded-full shadow-lg text-red-500"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 size="18" strokeWidth={2} />
        </MiniButton>
      )}
    </div>
  )
}

function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined || bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function getFileTypeLabel(filename: string, fileType?: string): string {
  const ext = filename.split('.').pop()?.toUpperCase()
  if (ext) return ext
  if (fileType) return fileType.split('/').pop()?.toUpperCase() || fileType
  return ''
}

export function MessageAttachment(props: {
  label: string
  filename?: string
  url?: string
  storageKey?: string
  fileType?: string
  byteLength?: number
}) {
  const { label, filename, url, storageKey, fileType, byteLength } = props
  const { t } = useTranslation()

  const handleClick = async () => {
    if (storageKey) {
      let title: string
      if (filename) {
        title = `${t('File Content')}: ${filename}`
      } else if (url) {
        const truncatedUrl = url.length > 50 ? `${url.slice(0, 50)}...` : url
        title = `${t('Link Content')}: ${truncatedUrl}`
      } else {
        title = t('Content')
      }
      await NiceModal.show('content-viewer', { title, storageKey })
    }
  }

  const isClickable = !!storageKey
  const typeLabel = filename ? getFileTypeLabel(filename, fileType) : ''
  const sizeLabel = formatFileSize(byteLength)
  const subtitle = [typeLabel, sizeLabel].filter(Boolean).join(' · ')

  return (
    <Tooltip title={isClickable ? t('Click to view parsed content') : label}>
      <div
        className={`flex items-center gap-2 px-2 py-1.5 min-w-0 overflow-hidden
            rounded-md
            bg-chatbox-background-secondary
            ${isClickable ? 'cursor-pointer hover:bg-chatbox-background-secondary-hover transition-colors' : ''}`}
        onClick={handleClick}
      >
        <div className="flex-none w-7 h-7 rounded-md bg-chatbox-background-primary flex items-center justify-center">
          {filename && <FileIcon filename={filename} className="w-4 h-4" />}
          {url && !filename && <Link2 className="w-4 h-4 text-chatbox-secondary" strokeWidth={1.5} />}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <Typography className="text-xs leading-tight truncate" noWrap>
            {label}
          </Typography>
          {subtitle && (
            <Typography className="text-chatbox-tertiary" noWrap sx={{ fontSize: '10px', lineHeight: 1.4 }}>
              {subtitle}
            </Typography>
          )}
        </div>
        {isClickable && (
          <Eye
            className="flex-none w-3.5 h-3.5 text-chatbox-tertiary opacity-0 group-hover/attachment:opacity-100 transition-opacity"
            strokeWidth={1.5}
          />
        )}
      </div>
    </Tooltip>
  )
}

export function LinkMiniCard(props: {
  url: string
  onDelete: () => void
  status?: 'processing' | 'completed' | 'error'
  errorMessage?: string
  onErrorClick?: () => void
}) {
  const { url, onDelete, status, errorMessage, onErrorClick } = props
  const { t } = useTranslation()
  const label = url.replace(/^https?:\/\//, '')

  const handleClick = () => {
    if (status === 'error' && onErrorClick) {
      onErrorClick()
    }
  }

  // 获取翻译后的错误消息
  const translatedError = getTranslatedErrorMessage(errorMessage, t)

  return (
    <div
      className="w-[100px] h-[100px] p-1 m-1 inline-flex items-center justify-center
                                bg-white shadow-sm rounded-md border-solid border-gray-400/20
                                hover:shadow-lg hover:cursor-pointer hover:scale-105 transition-all duration-200
                                group/file-mini-card relative"
      onClick={handleClick}
    >
      <Tooltip title={status === 'error' && translatedError ? translatedError : url}>
        <div className="flex flex-col justify-center items-center">
          <Link className="w-8 h-8 text-black" strokeWidth={1} />
          <Typography className="w-20 pt-1 text-black text-center" noWrap sx={{ fontSize: '10px' }}>
            {label}
          </Typography>
        </div>
      </Tooltip>
      {onDelete && (
        <MiniButton
          className="hidden group-hover/file-mini-card:inline-block
                    absolute top-0 right-0 m-1 p-1 rounded-full shadow-lg text-red-500"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 size="18" strokeWidth={2} />
        </MiniButton>
      )}
    </div>
  )
}
