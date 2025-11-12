import { Alert, Button, Flex, Paper, PasswordInput, Progress, Stack, Text, Title } from '@mantine/core'
import {
  IconArrowRight,
  IconCircleCheckFilled,
  IconExclamationCircle,
  IconExternalLink,
  IconHelp,
  IconRefresh,
  IconRestore,
} from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { type ModelProvider, ModelProviderEnum } from 'src/shared/types'
import { ModelList } from '@/components/ModelList'
import { Modal } from '@/components/Overlay'
import { ScalableIcon } from '@/components/ScalableIcon'
import useChatboxAIModels from '@/hooks/useChatboxAIModels'
import { trackingEvent } from '@/packages/event'
import { getLicenseDetailRealtime } from '@/packages/remote'
import platform from '@/platform'
import * as premiumActions from '@/stores/premiumActions'
import { useLanguage, useProviderSettings, useSettingsStore } from '@/stores/settingsStore'

const useLicenseDetail = (licenseKey: string) => {
  const { data: licenseDetail, ...others } = useQuery({
    queryKey: ['license-detail', licenseKey],
    queryFn: async () => {
      const res = await getLicenseDetailRealtime({ licenseKey })
      return res
    },
    enabled: !!licenseKey,
  })

  return {
    licenseDetail,
    ...others,
  }
}

export const Route = createFileRoute('/settings/provider/chatbox-ai')({
  component: RouteComponent,
})

export function RouteComponent() {
  const { t } = useTranslation()
  const language = useLanguage()
  const providerId: ModelProvider = ModelProviderEnum.ChatboxAI
  const { providerSettings, setProviderSettings } = useProviderSettings(providerId)
  const settings = useSettingsStore((state) => state)

  const [licenseKey, setLicenseKey] = useState(settings.licenseKey || '')
  const [isDeactivating, setIsDeactivating] = useState(false)

  const activated = premiumActions.useAutoValidate()
  const [activating, setActivating] = useState(false)
  const [activateError, setActivateError] = useState<string>()

  const { allChatboxAIModels, chatboxAIModels, refetch: refetchChatboxAIModels } = useChatboxAIModels()

  const deleteModel = (modelId: string) => {
    setProviderSettings({
      excludedModels: [...(providerSettings?.excludedModels || []), modelId],
    })
  }

  const resetModels = () => {
    setProviderSettings({
      models: [],
      excludedModels: [],
    })
  }

  const activate = useCallback(async () => {
    try {
      setActivating(true)
      setActivateError(undefined)
      const result = await premiumActions.activate(licenseKey || '')
      if (!result.valid) {
        setActivateError(result.error)
      }
    } catch (e: any) {
      setActivateError(e?.message || 'unknow error')
    } finally {
      setActivating(false)
    }
  }, [licenseKey])

  // 自动激活
  useEffect(() => {
    if (
      !isDeactivating &&
      licenseKey &&
      licenseKey.length >= 36 &&
      !settings.licenseInstances?.[licenseKey] // 仅当 license key 还没激活
    ) {
      console.log('auto activate')
      activate()
    }
  }, [licenseKey, activate, settings.licenseInstances, isDeactivating])

  const [showFetchedModels, setShowFetchedModels] = useState(false)
  const handleFetchModels = () => {
    refetchChatboxAIModels()
    setShowFetchedModels(true)
  }

  const { licenseDetail } = useLicenseDetail(settings.licenseKey || '')

  return (
    <Stack gap="xxl">
      <Flex gap="xs" align="center">
        <Title order={3} c="chatbox-secondary">
          Chatbox AI
        </Title>
        <Button
          variant="transparent"
          c="chatbox-tertiary"
          px={0}
          h={24}
          onClick={() => platform.openLink('https://chatboxai.app')}
        >
          <ScalableIcon icon={IconExternalLink} size={24} />
        </Button>

        <Flex gap="xxs" align="center" className="ml-auto" c="chatbox-brand">
          <ScalableIcon icon={IconHelp} />
          <Text
            component="a"
            c="chatbox-brand"
            className="!underline"
            href={`https://chatboxai.app/redirect_app/how_to_use_license/${language}`}
            target="_blank"
          >
            {t('How to use?')}
          </Text>
        </Flex>
      </Flex>

      <Stack gap="xl">
        <Stack gap="md">
          {/* Chatbox AI License */}
          <Stack gap="xxs">
            <Text fw="600">{t('Chatbox AI License')}</Text>
            <Flex gap="xs" align="center">
              <PasswordInput
                flex={1}
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.currentTarget.value)}
                readOnly={activated}
              />

              {!activated ? (
                <Button onClick={activate} loading={activating}>
                  {t('Activate License')}
                </Button>
              ) : (
                <Button
                  color="chatbox-success"
                  variant="subtle"
                  onClick={async () => {
                    setIsDeactivating(true)
                    await premiumActions.deactivate()
                    setLicenseKey('')
                    setIsDeactivating(false)
                    trackingEvent('click_deactivate_license_button', { event_category: 'user' })
                  }}
                >
                  {t('Deactivate')}
                </Button>
              )}
            </Flex>
            {activated && <Text c="chatbox-success">{t('License Activated')}</Text>}
            {activateError && (
              <Text c="chatbox-error">
                {activateError === 'not_found' ? (
                  t('License not found, please check your license key')
                ) : activateError === 'expired' ? (
                  t('License expired, please check your license key')
                ) : activateError === 'reached_activation_limit' ? (
                  <Trans
                    i18nKey="This license key has reached the activation limit, <a>click here</a> to manage license and devices to deactivate old devices."
                    components={{
                      a: (
                        <a
                          href={`https://chatboxai.app/redirect_app/manage_license/${language}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline !text-inherit !font-semibold"
                        />
                      ),
                    }}
                  />
                ) : (
                  <>
                    {t('Failed to activate license, please check your license key and network connection')}
                    <br />
                    Error: {activateError.slice(0, 100)}
                  </>
                )}
              </Text>
            )}
          </Stack>

          {activated && licenseDetail ? (
            <>
              <Paper shadow="xs" p="sm" withBorder>
                <Stack gap="lg">
                  {/* Chatbox AI Standard Model Quota & Chatbox AI Advanced Model Quota */}
                  {(
                    [
                      [
                        t('Chatbox AI Quota'),
                        licenseDetail.remaining_quota_unified * 100,
                        `${(licenseDetail.remaining_quota_unified * 100).toFixed(2)}%`,
                      ],
                      ...(licenseDetail.expansion_pack_limit
                        ? [
                            [
                              t('Expansion Pack Quota'),
                              ((licenseDetail.expansion_pack_limit - licenseDetail.expansion_pack_usage) /
                                licenseDetail.expansion_pack_limit) *
                                100,
                              `${(((licenseDetail.expansion_pack_limit - licenseDetail.expansion_pack_usage) / licenseDetail.expansion_pack_limit) * 100).toFixed(2)}%`,
                            ],
                          ]
                        : []),
                      [
                        t('Chatbox AI Image Quota'),
                        licenseDetail.image_total_quota > 0
                          ? ((licenseDetail.image_total_quota - licenseDetail.image_used_count) /
                              licenseDetail.image_total_quota) *
                            100
                          : 0,
                        `${licenseDetail.image_total_quota - licenseDetail.image_used_count}/${
                          licenseDetail.image_total_quota
                        }`,
                      ],
                    ] as const
                  ).map(([key, val, text]) => (
                    <Stack key={key} gap="xxs">
                      <Flex align="center" justify="space-between">
                        <Text>{key}</Text>
                        <Text c="chatbox-brand" fw="600">
                          {text}
                        </Text>
                      </Flex>
                      <Progress value={Number(val)} />
                    </Stack>
                  ))}

                  {/* Quota Reset & License Expiry */}
                  <Flex gap="lg">
                    {[
                      [t('Quota Reset'), new Date(licenseDetail.token_next_refresh_time!).toLocaleDateString()],
                      [
                        t('License Expiry'),
                        licenseDetail.token_expire_time
                          ? new Date(licenseDetail.token_expire_time).toLocaleDateString()
                          : '',
                      ],
                    ].map(([key, val]) => (
                      <Stack key={key} flex={1} gap="xxs">
                        <Text>{key}</Text>
                        <Text size="md" fw="600">
                          {val}
                        </Text>
                      </Stack>
                    ))}
                  </Flex>

                  <Stack flex={1} gap="xxs">
                    <Text>{t('License Plan Overview')}</Text>
                    <Text size="md" fw="600">
                      {licenseDetail.name}
                    </Text>
                  </Stack>
                </Stack>
              </Paper>

              {licenseDetail.remaining_quota_unified <= 0 &&
                licenseDetail.expansion_pack_limit - licenseDetail.expansion_pack_usage <= 0 && (
                  <Alert variant="light" color="yellow" p="sm">
                    <Flex gap="xs" align="center" c="chatbox-primary">
                      <ScalableIcon icon={IconExclamationCircle} className="flex-shrink-0" />
                      <Text>{t('You have no more Chatbox AI quota left this month.')}</Text>

                      <a
                        href={`https://chatboxai.app/redirect_app/manage_license/${language}/${settings.licenseKey}`}
                        target="_blank"
                        className="ml-auto flex flex-row items-center gap-xxs"
                      >
                        <Text span fw={600} className="whitespace-nowrap">
                          {t('get more')}
                        </Text>
                        <ScalableIcon icon={IconArrowRight} />
                      </a>
                    </Flex>
                  </Alert>
                )}

              <Flex gap="xs" align="center">
                <Button
                  variant="outline"
                  flex={1}
                  onClick={() => {
                    platform.openLink(`https://chatboxai.app/redirect_app/manage_license/${language}`)
                    trackingEvent('click_manage_license_button', { event_category: 'user' })
                  }}
                >
                  {t('Manage License and Devices')}
                </Button>
                <Button
                  variant="outline"
                  flex={1}
                  onClick={() => {
                    platform.openLink('https://chatboxai.app/redirect_app/view_more_plans')
                    trackingEvent('click_view_more_plans_button', { event_category: 'user' })
                  }}
                >
                  {t('View More Plans')}
                </Button>
              </Flex>
            </>
          ) : (
            <>
              {/* chatboxai 未激活 */}
              <Paper shadow="xs" p="sm" withBorder>
                <Stack gap="sm">
                  <Text fw="600" c="chatbox-brand">
                    {t('Chatbox AI offers a user-friendly AI solution to help you enhance productivity')}
                  </Text>
                  <Stack>
                    {[
                      t('Smartest AI-Powered Services for Rapid Access'),
                      t('Vision, Drawing, File Understanding and more'),
                      t('Hassle-free setup'),
                      t('Ideal for work and study'),
                    ].map((item) => (
                      <Flex key={item} gap="xs" align="center">
                        <ScalableIcon
                          icon={IconCircleCheckFilled}
                          className=" flex-shrink-0 flex-grow-0 text-chatbox-tint-brand"
                        />
                        <Text>{item}</Text>
                      </Flex>
                    ))}
                  </Stack>
                </Stack>
              </Paper>

              <Flex gap="xs" align="center">
                <Button
                  variant="outline"
                  flex={1}
                  onClick={() => {
                    platform.openLink(`https://chatboxai.app/redirect_app/get_license`)
                    trackingEvent('click_get_license_button', { event_category: 'user' })
                  }}
                >
                  {t('Get License')}
                </Button>
                <Button
                  variant="outline"
                  flex={1}
                  onClick={() => {
                    platform.openLink(`https://chatboxai.app/redirect_app/manage_license/${language}`)
                    trackingEvent('click_retrieve_license_button', { event_category: 'user' })
                  }}
                >
                  {t('Retrieve License')}
                </Button>
              </Flex>
            </>
          )}
        </Stack>

        <Stack gap="xxs">
          <Flex justify="space-between" align="center">
            <Text span fw="600">
              {t('Model')}
            </Text>
            <Flex gap="sm" align="center" justify="flex-end">
              <Button
                variant="light"
                color="chatbox-gray"
                c="chatbox-secondary"
                size="compact-xs"
                px="sm"
                onClick={resetModels}
                leftSection={<ScalableIcon icon={IconRestore} size={12} />}
              >
                {t('Reset')}
              </Button>

              <Button
                variant="light"
                color="chatbox-gray"
                c="chatbox-secondary"
                size="compact-xs"
                px="sm"
                onClick={handleFetchModels}
                leftSection={<ScalableIcon icon={IconRefresh} size={12} />}
              >
                {t('Fetch')}
              </Button>
            </Flex>
          </Flex>

          <ModelList models={chatboxAIModels} showActions={true} onDeleteModel={deleteModel} showSearch={false} />
        </Stack>
      </Stack>

      <Modal
        keepMounted={false}
        opened={showFetchedModels}
        onClose={() => setShowFetchedModels(false)}
        title={t('Edit Model')}
        centered={true}
        size="lg"
        classNames={{
          content: '!max-h-[95vh]',
        }}
      >
        <ModelList
          models={allChatboxAIModels}
          showActions={true}
          onAddModel={(model) =>
            setProviderSettings({
              excludedModels: (providerSettings?.excludedModels || []).filter((m) => m !== model.modelId),
            })
          }
          onRemoveModel={(modelId) =>
            setProviderSettings({
              excludedModels: [...(providerSettings?.excludedModels || []), modelId],
            })
          }
          displayedModelIds={chatboxAIModels.map((m) => m.modelId)}
          showSearch={true}
        />
      </Modal>
    </Stack>
  )
}
