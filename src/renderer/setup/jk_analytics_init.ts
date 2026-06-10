import { initJkAnalytics, trackJkViewEvent } from '@/analytics/jk'
import { JK_EVENTS } from '@/analytics/jk-events'
import { initSettingsStore } from '@/stores/settingsStore'

;(async () => {
  try {
    const settings = await initSettingsStore()
    if (!settings.allowReportingAndTracking) {
      return
    }
    await initJkAnalytics()

    trackJkViewEvent(JK_EVENTS.APP_LAUNCH, {})
  } catch (e) {
    console.error('Failed to initialize jk analytics:', e)
  }
})()
