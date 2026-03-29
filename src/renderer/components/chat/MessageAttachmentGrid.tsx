import type { MessageFile, MessageLink } from '@shared/types'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageAttachment } from '../InputBox/Attachments'

const COLLAPSED_MAX = 4

interface MessageAttachmentGridProps {
  files?: MessageFile[]
  links?: MessageLink[]
}

export function MessageAttachmentGrid({ files, links }: MessageAttachmentGridProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const fileItems = files ?? []
  const linkItems = links ?? []
  const totalCount = fileItems.length + linkItems.length

  if (totalCount === 0) return null

  const shouldCollapse = totalCount > COLLAPSED_MAX
  const visibleFileCount = shouldCollapse && !expanded ? Math.min(fileItems.length, COLLAPSED_MAX) : fileItems.length
  const remainingSlots = shouldCollapse && !expanded ? COLLAPSED_MAX - visibleFileCount : linkItems.length
  const visibleLinkCount = Math.max(0, Math.min(linkItems.length, remainingSlots))

  return (
    <div className="mt-1 mb-1 max-w-[500px]">
      <div className="grid grid-cols-2 gap-1.5">
        {fileItems.slice(0, visibleFileCount).map((file) => (
          <div key={file.id} className="group/attachment min-w-0 overflow-hidden">
            <MessageAttachment
              label={file.name}
              filename={file.name}
              fileType={file.fileType}
              byteLength={file.byteLength}
              storageKey={file.storageKey}
            />
          </div>
        ))}
        {linkItems.slice(0, visibleLinkCount).map((link) => (
          <div key={link.id} className="group/attachment min-w-0 overflow-hidden">
            <MessageAttachment
              label={link.title}
              url={link.url}
              byteLength={link.byteLength}
              storageKey={link.storageKey}
            />
          </div>
        ))}
      </div>
      {shouldCollapse && (
        <button
          type="button"
          className="flex items-center gap-1 mt-1 ml-auto px-2 py-0.5 text-xs text-chatbox-tertiary hover:text-chatbox-secondary bg-transparent border-0 cursor-pointer transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              {t('Collapse attachments')}
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              {t('Show all attachments')} ({totalCount})
            </>
          )}
        </button>
      )}
    </div>
  )
}
