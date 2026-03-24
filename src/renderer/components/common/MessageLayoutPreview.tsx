import { Box, Flex, type FlexProps, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconCircleCheckFilled } from '@tabler/icons-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { ScalableIcon } from './ScalableIcon'

type MessageLayout = 'left' | 'bubble'

type MessageLayoutSelectorProps = {
  value: MessageLayout
  onValueChange: (value: MessageLayout) => void
} & FlexProps

const layoutOptions: { value: MessageLayout; labelKey: string; Preview: () => React.JSX.Element }[] = [
  { value: 'left', labelKey: 'Classic', Preview: ClassicLayoutPreview },
  { value: 'bubble', labelKey: 'Bubble', Preview: BubbleLayoutPreview },
]

export function MessageLayoutSelector({ value, onValueChange, ...props }: MessageLayoutSelectorProps) {
  const { t } = useTranslation()
  return (
    <Flex gap="lg" maw={432} {...props}>
      {layoutOptions.map(({ value: optVal, labelKey, Preview }) => {
        const selected = optVal === value
        return (
          <UnstyledButton key={optVal} onClick={() => onValueChange(optVal)} className="flex-1">
            <Box
              p="md"
              className={clsx(
                'rounded-lg border border-solid border-chatbox-border-primary',
                selected ? 'border-chatbox-tint-brand outline-2 outline outline-chatbox-tint-brand' : ''
              )}
            >
              <Preview />
            </Box>
            <Flex align="center" justify="center" gap={4} mt="xs">
              {selected && <ScalableIcon icon={IconCircleCheckFilled} size={18} className="text-chatbox-tint-brand" />}
              <Text size="sm" fw={selected ? 500 : 400} c={selected ? 'chatbox-brand' : undefined}>
                {t(labelKey)}
              </Text>
            </Flex>
          </UnstyledButton>
        )
      })}
    </Flex>
  )
}

export function ClassicLayoutPreview() {
  return (
    <Stack gap="sm">
      {/* Row 1: avatar + short message */}
      <Flex gap="xs" align="center">
        <div className="w-8 h-8 rounded-full bg-chatbox-tint-brand flex-shrink-0" />
        <div className="bg-chatbox-background-tertiary rounded-full px-4 py-2.5">
          {/* <div className="w-12 h-3 rounded-sm bg-[#ADB5BD] opacity-40" /> */}
        </div>
      </Flex>
      {/* Row 2: avatar + long message */}
      <Flex align="self-start" gap="xs">
        <div className="w-8 h-8 rounded-full bg-chatbox-tint-brand flex-shrink-0" />
        <div className="flex flex-col gap-1.5 flex-1">
          <div className="w-full h-3 rounded-full bg-chatbox-background-tertiary" />
          <div className="w-full h-3 rounded-full bg-chatbox-background-tertiary" />
          <div className="w-full h-3 rounded-full bg-chatbox-background-tertiary" />
          <div className="w-1/2 h-3 rounded-full bg-chatbox-background-tertiary" />
        </div>
      </Flex>
    </Stack>
  )
}

export function BubbleLayoutPreview() {
  return (
    <Stack gap="sm">
      {/* User bubble (right side) */}
      <div className=" self-end w-3/4 bg-chatbox-tint-brand rounded-full px-4 py-2.5">
        <div className="h-3 rounded-sm bg-[rgba(255,255,255,0.32)]"></div>
      </div>
      {/* Assistant bubble (left side) */}
      <Stack gap={6} className="w-3/4 bg-chatbox-background-tertiary rounded-lg px-4 py-2.5">
        <div className="h-3 rounded-sm bg-[#ADB5BD] opacity-40 w-3/4"></div>
        <div className="h-3 rounded-sm bg-[#ADB5BD] opacity-40"></div>
        <div className="h-3 rounded-sm bg-[#ADB5BD] opacity-40"></div>
      </Stack>
    </Stack>
  )
}
