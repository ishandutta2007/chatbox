import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import log from 'electron-log/main'

const sqliteSidecarSuffixes = ['', '-wal', '-shm', '-journal'] as const

function migrateLegacyKnowledgeBaseDatabase() {
  const userDataPath = app.getPath('userData')
  const legacyDbPath = path.join(userDataPath, 'databases', 'chatbox_kb.db')
  const targetDbPath = path.join(userDataPath, 'chatbox-databases', 'chatbox_kb.db')

  if (fs.existsSync(targetDbPath) || !fs.existsSync(legacyDbPath)) {
    return
  }

  fs.mkdirSync(path.dirname(targetDbPath), { recursive: true })

  for (const suffix of sqliteSidecarSuffixes) {
    const sourcePath = `${legacyDbPath}${suffix}`
    const targetPath = `${targetDbPath}${suffix}`
    if (fs.existsSync(sourcePath) && !fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath)
    }
  }

  log.info(`[DB] Migrated knowledge base sqlite files: ${legacyDbPath} -> ${targetDbPath}`)
}

migrateLegacyKnowledgeBaseDatabase()
