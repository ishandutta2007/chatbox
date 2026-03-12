import NiceModal from '@ebay/nice-modal-react'
import { Avatar, Button, CloseButton, Flex, ScrollArea, Stack, Text } from '@mantine/core'
import type { CopilotDetail, ImageSource } from '@shared/types'
import { IconEdit, IconMessageCircle2Filled } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { AdaptiveModal } from '@/components/common/AdaptiveModal'
import { ScalableIcon } from '@/components/common/ScalableIcon'
import { ImageInStorage } from '@/components/Image'
import { useMyCopilots } from '@/hooks/useCopilots'

function CopilotImage({ source, className, alt }: { source: ImageSource; className?: string; alt?: string }) {
  if (source.type === 'storage-key') {
    return <ImageInStorage storageKey={source.storageKey} className={className} />
  }
  return <img src={source.url} alt={alt} className={className} />
}

interface CopilotDetailModalProps {
  opened: boolean
  onClose: () => void
  type: 'local' | 'remote'
  copilot: CopilotDetail | null
  onUse?: (copilot: CopilotDetail) => void
}

export function CopilotDetailModal({ opened, onClose, type, copilot, onUse }: CopilotDetailModalProps) {
  const { t, i18n } = useTranslation()
  const { addOrUpdate } = useMyCopilots()

  if (!copilot) return null

  const { name, avatar, picUrl, description, prompt, tags, screenshots, createdAt } = copilot

  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleDateString(i18n.language, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null

  return (
    <AdaptiveModal
      opened={opened}
      onClose={onClose}
      centered
      size="lg"
      trapFocus={false}
      withCloseButton={false}
      padding={0}
    >
      <Stack gap="xl" p="sm">
        <Stack gap="md">
          {/* Header: Avatar + Title + Tags + Date + Close */}
          <Flex align="center" gap="sm">
            {avatar?.type === 'storage-key' || avatar?.type === 'url' || picUrl ? (
              <Avatar
                src={avatar?.type === 'storage-key' ? '' : avatar?.url || picUrl}
                alt={name}
                size={48}
                radius="xl"
                className="flex-shrink-0 border border-solid border-chatbox-border-primary"
              >
                {avatar?.type === 'storage-key' ? (
                  <ImageInStorage storageKey={avatar.storageKey} className="object-cover object-center w-full h-full" />
                ) : (
                  name?.charAt(0)?.toUpperCase()
                )}
              </Avatar>
            ) : (
              <Stack
                w={48}
                h={48}
                align="center"
                justify="center"
                className="flex-shrink-0 rounded-full bg-chatbox-background-brand-secondary"
              >
                <ScalableIcon icon={IconMessageCircle2Filled} size={24} className="text-chatbox-tint-brand" />
              </Stack>
            )}

            <Stack gap={0} className="flex-1">
              <Text fw={600} size="lg" lineClamp={1}>
                {name}
              </Text>
              <Flex align="center" gap="xs" wrap="wrap">
                {tags?.map((tag) => (
                  <Text
                    key={tag}
                    span
                    size="xxs"
                    c="chatbox-brand"
                    px={8}
                    py={2}
                    className="block rounded-full bg-chatbox-background-brand-secondary"
                  >
                    {t(tag)}
                  </Text>
                ))}
                {formattedDate && (
                  <Text size="xxs" c="chatbox-tertiary" className="whitespace-nowrap">
                    {type === 'remote'
                      ? t('Published on {{date}}', { date: formattedDate })
                      : t('Created on {{date}}', { date: formattedDate })}
                  </Text>
                )}
              </Flex>
            </Stack>

            <CloseButton onClick={onClose} className="self-start max-md:hidden" />
          </Flex>

          {/* Description */}
          {description && (
            <Stack gap="xxs">
              <Text size="sm" c="chatbox-secondary">
                {t('Description')}
              </Text>
              <Text size="sm" c="chatbox-secondary" py={6} className="whitespace-pre-wrap">
                {description}
              </Text>
            </Stack>
          )}

          {/* Prompt Content */}
          {prompt && (
            <Stack gap="xxs" my="xs">
              <Text size="sm" c="chatbox-secondary">
                {t('Prompt Content')}
              </Text>
              <ScrollArea.Autosize mah="40vh" className="rounded-sm border border-solid border-chatbox-border-primary ">
                <Text size="sm" c="chatbox-primary" p="xs" className="whitespace-pre-wrap">
                  {prompt}
                </Text>
              </ScrollArea.Autosize>
            </Stack>
          )}

          {/* Screenshots */}
          {screenshots && screenshots.length > 0 && (
            <Stack gap="xxs">
              <Text size="sm" c="chatbox-secondary">
                {t('Screenshots')}
              </Text>
              <Flex gap="xs" wrap="wrap" className="overflow-x-auto pb-xs">
                {screenshots.map((screenshot) => {
                  const key = screenshot.type === 'storage-key' ? screenshot.storageKey : screenshot.url
                  return (
                    <CopilotImage
                      key={key}
                      source={screenshot}
                      alt={name}
                      className="h-[200px] rounded-sm border border-solid border-chatbox-border-primary"
                    />
                  )
                })}
              </Flex>
            </Stack>
          )}
        </Stack>

        {/* Footer Actions */}
        <Flex justify="flex-end" gap="xs">
          {type === 'local' && (
            <Button
              variant="outline"
              leftSection={<ScalableIcon icon={IconEdit} size={16} />}
              onClick={() => {
                onClose()
                void NiceModal.show('copilot-settings', {
                  copilot,
                  mode: 'edit',
                  onSave: (updated: CopilotDetail) => {
                    addOrUpdate(updated)
                  },
                })
              }}
            >
              {t('Edit')}
            </Button>
          )}
          {type === 'remote' && (
            <Button
              variant="outline"
              onClick={() => {
                addOrUpdate({
                  id: copilot.id,
                  name: copilot.name,
                  prompt: copilot.prompt,
                  avatar: copilot.avatar,
                  backgroundImage: copilot.backgroundImage,
                  description: copilot.description,
                })
                onClose()
              }}
            >
              {t('Add to My Copilots')}
            </Button>
          )}
          <Button
            variant="filled"
            onClick={() => {
              onUse?.(copilot)
              onClose()
            }}
          >
            {t('Use this Copilot')}
          </Button>
        </Flex>
      </Stack>
    </AdaptiveModal>
  )
}

export default CopilotDetailModal
