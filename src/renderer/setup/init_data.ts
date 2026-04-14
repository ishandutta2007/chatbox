import type { SessionMetaRecord } from '@shared/types'
import { defaultSessionsForCN, defaultSessionsForEN } from '@/packages/initial_data'
import platform from '@/platform'
import storage from '@/storage'
import { StorageKeyGenerator } from '@/storage/StoreStorage'
import * as chatStore from '@/stores/chatStore'
import { getSessionMeta } from '@/stores/sessionHelpers'

export async function initData() {
  await initSessionsIfNeeded()
}

async function initSessionsIfNeeded() {
  const metaStorage = await chatStore.getMetaStorage()
  const total = await metaStorage.getTotal()
  if (total > 0) {
    return
  }

  const lang = await platform.getLocale().catch((e) => 'en')
  const defaultSessions = lang.startsWith('zh') ? defaultSessionsForCN : defaultSessionsForEN

  for (const session of defaultSessions) {
    await storage.setItemNow(StorageKeyGenerator.session(session.id), session)
  }

  const now = Date.now()
  const records: SessionMetaRecord[] = defaultSessions.map((session, i) => ({
    ...getSessionMeta(session),
    sortOrder: now - i * 1000,
    createdAt: now - i * 1000,
  }))

  await metaStorage.createMany(records)
}
