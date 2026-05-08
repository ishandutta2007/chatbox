import fs from 'node:fs'
import path from 'node:path'
import type { Client } from '@libsql/client'
import { LibSQLVector } from '@mastra/libsql'
import { app } from 'electron'
import { sentry } from '../adapters/sentry'
import { getLogger } from '../util'
import { SESSION_ATTACHMENT_RAG_LOG_PREFIX } from '../../shared/session-attachment-rag/logging'

const log = getLogger('session-attachment-rag:db')

const dbPath =
  process.env.SESSION_ATTACHMENT_RAG_DB_PATH ||
  path.join(app.getPath('userData'), 'databases', 'chatbox_session_rag.db')

function ensureDbDir() {
  const dbDir = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
}

ensureDbDir()

if (typeof global.crypto === 'undefined' || !('subtle' in global.crypto)) {
  global.crypto = require('node:crypto')
}

let db: Client
let vectorStore: LibSQLVector

export type SessionAttachmentStatus = 'pending' | 'indexing' | 'ready' | 'failed' | 'canceled'

export interface SessionAttachmentRecord {
  id: number
  sessionId: string
  messageId: string
  attachmentStorageKey: string
  filename: string
  mimeType: string
  fileSize: number
  tokenEstimate: number
  chunkCount?: number
  parserType?: string
  status: SessionAttachmentStatus
  error?: string
  createdAt?: string
  processingStartedAt?: string
  completedAt?: string
}

export interface SessionAttachmentDebugSnapshot {
  dbPath: string
  dbSizeBytes: number
  attachmentCount: number
  parentCount: number
  chunkCount: number
  vectorIndexNames: string[]
  statusCounts: {
    pending: number
    indexing: number
    ready: number
    failed: number
  }
  recentAttachments: Array<
    Omit<SessionAttachmentRecord, 'status'> & { status: 'pending' | 'indexing' | 'ready' | 'failed' }
  >
}

export interface CreateSessionAttachmentParams {
  sessionId: string
  messageId: string
  attachmentStorageKey: string
  filename: string
  mimeType: string
  fileSize: number
  tokenEstimate: number
  parserType?: string
}

function mapRowToSessionAttachmentRecord(row: Record<string, unknown>): SessionAttachmentRecord {
  return {
    id: Number(row.id),
    sessionId: String(row.session_id),
    messageId: String(row.message_id),
    attachmentStorageKey: String(row.attachment_storage_key),
    filename: String(row.filename),
    mimeType: String(row.mime_type),
    fileSize: Number(row.file_size ?? 0),
    tokenEstimate: Number(row.token_estimate ?? 0),
    chunkCount: Number(row.chunk_count ?? 0),
    parserType: row.parser_type ? String(row.parser_type) : undefined,
    status: String(row.status) as SessionAttachmentStatus,
    error: row.error ? String(row.error) : undefined,
    createdAt: row.created_at ? String(row.created_at) : undefined,
    processingStartedAt: row.processing_started_at ? String(row.processing_started_at) : undefined,
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
  }
}

/**
 * Schema version of the session attachment RAG database. Bump this when introducing
 * non-backward-compatible schema changes and add a corresponding migration step in
 * `runSchemaMigrations`. The current schema is treated as version 1 (initial release);
 * any installation found at version 0 is upgraded to 1 by simply stamping user_version.
 */
const SCHEMA_VERSION = 1

async function getSchemaVersion(client: Client): Promise<number> {
  const rs = await client.execute('PRAGMA user_version')
  return Number(rs.rows[0]?.user_version ?? 0)
}

async function setSchemaVersion(client: Client, version: number) {
  // PRAGMA does not accept parameter binding for the value; the version is a controlled
  // integer constant defined in this file, so direct interpolation is safe.
  await client.execute(`PRAGMA user_version = ${version}`)
}

async function runSchemaMigrations(client: Client) {
  const currentVersion = await getSchemaVersion(client)
  if (currentVersion >= SCHEMA_VERSION) {
    return
  }
  log.info(
    `${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Migrating schema: current=${currentVersion}, target=${SCHEMA_VERSION}`
  )
  // Future migrations look like:
  //   if (currentVersion < 2) { await client.execute('ALTER TABLE ...'); }
  //   if (currentVersion < 3) { ... }
  // The CREATE TABLE IF NOT EXISTS statements above guarantee the v1 baseline already
  // exists for both fresh installs and pre-versioned installs, so v0 → v1 needs no DDL.
  await setSchemaVersion(client, SCHEMA_VERSION)
}

async function initDB(client: Client) {
  try {
    await client.batch([
      `CREATE TABLE IF NOT EXISTS session_attachment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        attachment_storage_key TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size INTEGER DEFAULT 0,
        token_estimate INTEGER DEFAULT 0,
        parser_type TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processing_started_at DATETIME,
        completed_at DATETIME
      )`,
      `CREATE TABLE IF NOT EXISTS session_attachment_parent (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attachment_id INTEGER NOT NULL,
        parent_order INTEGER NOT NULL,
        section_path TEXT,
        doc_type TEXT,
        page_start INTEGER,
        page_end INTEGER,
        text TEXT NOT NULL,
        token_estimate INTEGER DEFAULT 0,
        char_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (attachment_id) REFERENCES session_attachment(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS session_attachment_chunk (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attachment_id INTEGER NOT NULL,
        parent_id INTEGER NOT NULL,
        chunk_order INTEGER NOT NULL,
        section_path TEXT,
        page_start INTEGER,
        page_end INTEGER,
        raw_text TEXT NOT NULL,
        embedded_text TEXT NOT NULL,
        token_estimate INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (attachment_id) REFERENCES session_attachment(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES session_attachment_parent(id) ON DELETE CASCADE
      )`,
      'CREATE INDEX IF NOT EXISTS idx_session_attachment_session_id ON session_attachment(session_id)',
      'CREATE INDEX IF NOT EXISTS idx_session_attachment_message_id ON session_attachment(message_id)',
      'CREATE INDEX IF NOT EXISTS idx_session_attachment_status ON session_attachment(status)',
      'CREATE INDEX IF NOT EXISTS idx_session_attachment_parent_attachment_id ON session_attachment_parent(attachment_id)',
      'CREATE INDEX IF NOT EXISTS idx_session_attachment_chunk_attachment_id ON session_attachment_chunk(attachment_id)',
      'CREATE INDEX IF NOT EXISTS idx_session_attachment_chunk_parent_id ON session_attachment_chunk(parent_id)',
    ])
    await runSchemaMigrations(client)
    log.info(`${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Session attachment rag database initialized`)
  } catch (error) {
    log.error(`${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Failed to initialize session attachment rag database:`, error)
    sentry.withScope((scope) => {
      scope.setTag('component', 'session-attachment-rag-db')
      scope.setTag('operation', 'database_initialization')
      scope.setExtra('dbPath', dbPath)
      sentry.captureException(error)
    })
    throw error
  }
}

export async function initializeDatabase() {
  try {
    ensureDbDir()
    vectorStore = new LibSQLVector({
      connectionUrl: `file:${dbPath}`,
    })
    // biome-ignore lint/suspicious/noExplicitAny: mastra exposes the libsql client on an internal field
    db = (vectorStore as any).turso
    await db.execute('PRAGMA foreign_keys = ON')
    await initDB(db)
    await cleanupInterruptedIndexingAttachments()
  } catch (error) {
    log.error(
      `${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Failed to initialize session attachment rag database system:`,
      error
    )
    sentry.withScope((scope) => {
      scope.setTag('component', 'session-attachment-rag-db')
      scope.setTag('operation', 'vector_store_initialization')
      scope.setExtra('dbPath', dbPath)
      sentry.captureException(error)
    })
    throw error
  }
}

export function getDatabase(): Client {
  if (!db) {
    const error = new Error('Session attachment rag database not initialized')
    sentry.withScope((scope) => {
      scope.setTag('component', 'session-attachment-rag-db')
      scope.setTag('operation', 'database_access')
      sentry.captureException(error)
    })
    throw error
  }
  return db
}

export function getVectorStore(): LibSQLVector {
  if (!vectorStore) {
    const error = new Error('Session attachment rag vector store not initialized')
    sentry.withScope((scope) => {
      scope.setTag('component', 'session-attachment-rag-db')
      scope.setTag('operation', 'vector_store_access')
      sentry.captureException(error)
    })
    throw error
  }
  return vectorStore
}

export function getSessionAttachmentRagDbPath(): string {
  return dbPath
}

export function parseSQLiteTimestamp(sqliteTimestamp: string): number {
  try {
    const utcDate = new Date(`${sqliteTimestamp} UTC`)
    const timestamp = utcDate.getTime()
    if (Number.isNaN(timestamp)) {
      throw new Error(`Invalid timestamp format: ${sqliteTimestamp}`)
    }
    return timestamp
  } catch (error) {
    log.error(`${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Failed to parse SQLite timestamp: ${sqliteTimestamp}`, error)
    sentry.withScope((scope) => {
      scope.setTag('component', 'session-attachment-rag-db')
      scope.setTag('operation', 'timestamp_parsing')
      scope.setExtra('sqliteTimestamp', sqliteTimestamp)
      sentry.captureException(error)
    })
    return Date.now()
  }
}

export async function withTransaction<T>(operation: () => Promise<T>): Promise<T> {
  const client = getDatabase()
  const transactionId = Math.random().toString(36).slice(2, 10)

  try {
    await client.execute('BEGIN TRANSACTION')
    const result = await operation()
    await client.execute('COMMIT')
    log.debug(`${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Transaction ${transactionId} committed`)
    return result
  } catch (error) {
    log.error(`${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Transaction ${transactionId} failed:`, error)
    try {
      await client.execute('ROLLBACK')
    } catch (rollbackError) {
      log.error(
        `${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Failed to rollback transaction ${transactionId}:`,
        rollbackError
      )
      sentry.withScope((scope) => {
        scope.setTag('component', 'session-attachment-rag-db')
        scope.setTag('operation', 'transaction_rollback')
        scope.setExtra('transactionId', transactionId)
        sentry.captureException(rollbackError)
      })
    }
    sentry.withScope((scope) => {
      scope.setTag('component', 'session-attachment-rag-db')
      scope.setTag('operation', 'transaction_failure')
      scope.setExtra('transactionId', transactionId)
      sentry.captureException(error)
    })
    throw error
  }
}

export async function cleanupInterruptedIndexingAttachments() {
  try {
    const result = await db.execute({
      sql: 'UPDATE session_attachment SET status = ?, processing_started_at = NULL, completed_at = NULL WHERE status = ?',
      args: ['failed', 'indexing'],
    })
    const affectedRows = result.rowsAffected || 0
    if (affectedRows > 0) {
      log.info(
        `${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Marked ${affectedRows} interrupted indexing attachments as failed`
      )
    }
    return Number(affectedRows)
  } catch (error) {
    log.error(`${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Failed to cleanup interrupted indexing attachments:`, error)
    sentry.withScope((scope) => {
      scope.setTag('component', 'session-attachment-rag-db')
      scope.setTag('operation', 'cleanup_indexing_attachments')
      sentry.captureException(error)
    })
    return 0
  }
}

export async function deleteAttachmentIndex(attachmentId: number) {
  try {
    await getVectorStore().deleteIndex({ indexName: `sa_${attachmentId}` })
  } catch (error) {
    log.warn(
      `${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Failed to delete vector index for attachment ${attachmentId}:`,
      error
    )
  }
}

export async function deleteAttachmentGraph(attachmentId: number) {
  await withTransaction(async () => {
    const client = getDatabase()
    await client.execute({
      sql: 'DELETE FROM session_attachment WHERE id = ?',
      args: [attachmentId],
    })
  })
  await deleteAttachmentIndex(attachmentId)
}

/**
 * Delete multiple attachment graphs atomically:
 *  - SQL deletion of attachment + parent + chunk rows happens in a single transaction
 *    (FK CASCADE handles parent/chunk).
 *  - Vector index deletion is performed best-effort after the SQL transaction commits;
 *    this is a known cross-store gap (sqlite tables vs vector index tables) but at
 *    least the SQL side is now atomic instead of partial-on-failure.
 */
async function deleteAttachmentGraphsBatch(attachmentIds: number[]): Promise<void> {
  const ids = [...new Set(attachmentIds.filter((id) => Number.isFinite(id)))]
  if (ids.length === 0) {
    return
  }
  await withTransaction(async () => {
    const client = getDatabase()
    const placeholders = ids.map(() => '?').join(',')
    await client.execute({
      sql: `DELETE FROM session_attachment WHERE id IN (${placeholders})`,
      args: ids,
    })
  })
  await Promise.all(ids.map((id) => deleteAttachmentIndex(id)))
}

export async function createSessionAttachment(params: CreateSessionAttachmentParams): Promise<number> {
  const client = getDatabase()
  log.info(
    `${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Insert attachment task: session=${params.sessionId}, message=${params.messageId}, file="${params.filename}", parser=${params.parserType ?? 'unknown'}`
  )
  const rs = await client.execute({
    sql: `INSERT INTO session_attachment
      (session_id, message_id, attachment_storage_key, filename, mime_type, file_size, token_estimate, parser_type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      params.sessionId,
      params.messageId,
      params.attachmentStorageKey,
      params.filename,
      params.mimeType,
      params.fileSize,
      params.tokenEstimate,
      params.parserType ?? null,
      'pending',
    ],
  })
  log.info(
    `${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Inserted attachment task: attachmentId=${Number(rs.lastInsertRowid)}, status=pending`
  )
  return Number(rs.lastInsertRowid)
}

export async function getSessionAttachment(id: number): Promise<SessionAttachmentRecord | null> {
  const client = getDatabase()
  const rs = await client.execute({
    sql: `SELECT a.*,
      (SELECT COUNT(*) FROM session_attachment_chunk c WHERE c.attachment_id = a.id) AS chunk_count
      FROM session_attachment a
      WHERE a.id = ?`,
    args: [id],
  })
  const row = rs.rows[0]
  return row ? mapRowToSessionAttachmentRecord(row as Record<string, unknown>) : null
}

export async function listPendingSessionAttachments(limit = 10): Promise<SessionAttachmentRecord[]> {
  const client = getDatabase()
  const rs = await client.execute({
    sql: `SELECT a.*,
      (SELECT COUNT(*) FROM session_attachment_chunk c WHERE c.attachment_id = a.id) AS chunk_count
      FROM session_attachment a
      WHERE a.status = ?
      ORDER BY a.created_at ASC
      LIMIT ?`,
    args: ['pending', limit],
  })
  return rs.rows.map((row) => mapRowToSessionAttachmentRecord(row as Record<string, unknown>))
}

export async function listCanceledSessionAttachments(limit = 20): Promise<SessionAttachmentRecord[]> {
  const client = getDatabase()
  const rs = await client.execute({
    sql: `SELECT a.*,
      (SELECT COUNT(*) FROM session_attachment_chunk c WHERE c.attachment_id = a.id) AS chunk_count
      FROM session_attachment a
      WHERE a.status = ?
      ORDER BY a.created_at ASC
      LIMIT ?`,
    args: ['canceled', limit],
  })
  return rs.rows.map((row) => mapRowToSessionAttachmentRecord(row as Record<string, unknown>))
}

export async function purgeCanceledSessionAttachments(limit = 20): Promise<number> {
  const canceled = await listCanceledSessionAttachments(limit)
  if (canceled.length === 0) {
    return 0
  }
  for (const attachment of canceled) {
    log.info(
      `${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Purging canceled attachment: attachmentId=${attachment.id}, file="${attachment.filename}"`
    )
  }
  await deleteAttachmentGraphsBatch(canceled.map((attachment) => attachment.id))
  return canceled.length
}

export async function listSessionAttachmentsByIds(ids: number[]): Promise<SessionAttachmentRecord[]> {
  if (ids.length === 0) {
    return []
  }
  const client = getDatabase()
  const placeholders = ids.map(() => '?').join(',')
  const rs = await client.execute({
    sql: `SELECT a.*,
      (SELECT COUNT(*) FROM session_attachment_chunk c WHERE c.attachment_id = a.id) AS chunk_count
      FROM session_attachment a
      WHERE a.id IN (${placeholders})`,
    args: ids,
  })
  return rs.rows.map((row) => mapRowToSessionAttachmentRecord(row as Record<string, unknown>))
}

export async function markSessionAttachmentIndexing(id: number) {
  const client = getDatabase()
  const result = await client.execute({
    sql: 'UPDATE session_attachment SET status = ?, error = NULL, processing_started_at = CURRENT_TIMESTAMP, completed_at = NULL WHERE id = ? AND status = ?',
    args: ['indexing', id, 'pending'],
  })
  if ((result.rowsAffected || 0) > 0) {
    log.info(`${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Marked attachment indexing: attachmentId=${id}`)
    return true
  }
  return false
}

export async function markSessionAttachmentReady(id: number) {
  const client = getDatabase()
  const result = await client.execute({
    sql: 'UPDATE session_attachment SET status = ?, error = NULL, processing_started_at = NULL, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?',
    args: ['ready', id, 'indexing'],
  })
  if ((result.rowsAffected || 0) > 0) {
    log.info(`${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Marked attachment ready: attachmentId=${id}`)
    return true
  }
  return false
}

export async function markSessionAttachmentFailed(id: number, error: string) {
  const client = getDatabase()
  const result = await client.execute({
    sql: 'UPDATE session_attachment SET status = ?, error = ?, processing_started_at = NULL, completed_at = NULL WHERE id = ? AND status != ?',
    args: ['failed', error, id, 'canceled'],
  })
  if ((result.rowsAffected || 0) > 0) {
    log.info(`${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Marked attachment failed: attachmentId=${id}, error=${error}`)
  }
}

export async function retrySessionAttachment(id: number) {
  const client = getDatabase()
  const existing = await getSessionAttachment(id)
  if (!existing) {
    throw new Error(`Session attachment ${id} not found`)
  }
  if (existing.status !== 'failed') {
    throw new Error('Only failed session attachments can be retried')
  }
  await client.execute({
    sql: 'UPDATE session_attachment SET status = ?, error = NULL, processing_started_at = NULL, completed_at = NULL WHERE id = ?',
    args: ['pending', id],
  })
  log.info(`${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Reset attachment to pending: attachmentId=${id}`)
}

export async function cancelSessionAttachment(id: number) {
  const client = getDatabase()
  await client.execute({
    sql: 'UPDATE session_attachment SET status = ?, error = NULL, processing_started_at = NULL, completed_at = NULL WHERE id = ? AND status IN (?, ?, ?)',
    args: ['canceled', id, 'pending', 'indexing', 'failed'],
  })
  log.info(`${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Marked attachment canceled: attachmentId=${id}`)
}

export async function rebindSessionAttachment(id: number, sessionId: string, messageId: string) {
  const client = getDatabase()
  await client.execute({
    sql: 'UPDATE session_attachment SET session_id = ?, message_id = ? WHERE id = ?',
    args: [sessionId, messageId, id],
  })
  log.info(
    `${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Rebound attachment ownership: attachmentId=${id}, session=${sessionId}, message=${messageId}`
  )
}

export async function replaceAttachmentParentsAndChunks(
  attachmentId: number,
  parents: Array<{
    parentOrder: number
    sectionPath?: string
    docType?: string
    pageStart?: number
    pageEnd?: number
    text: string
    tokenEstimate: number
    charCount: number
  }>,
  chunks: Array<{
    parentOrder: number
    chunkOrder: number
    sectionPath?: string
    pageStart?: number
    pageEnd?: number
    rawText: string
    embeddedText: string
    tokenEstimate: number
  }>
): Promise<Map<number, number>> {
  return withTransaction(async () => {
    const client = getDatabase()
    await client.execute({
      sql: 'DELETE FROM session_attachment_chunk WHERE attachment_id = ?',
      args: [attachmentId],
    })
    await client.execute({
      sql: 'DELETE FROM session_attachment_parent WHERE attachment_id = ?',
      args: [attachmentId],
    })

    const parentIdMap = new Map<number, number>()
    for (const parent of parents) {
      const rs = await client.execute({
        sql: `INSERT INTO session_attachment_parent
          (attachment_id, parent_order, section_path, doc_type, page_start, page_end, text, token_estimate, char_count)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          attachmentId,
          parent.parentOrder,
          parent.sectionPath ?? null,
          parent.docType ?? null,
          parent.pageStart ?? null,
          parent.pageEnd ?? null,
          parent.text,
          parent.tokenEstimate,
          parent.charCount,
        ],
      })
      parentIdMap.set(parent.parentOrder, Number(rs.lastInsertRowid))
    }

    for (const chunk of chunks) {
      const parentId = parentIdMap.get(chunk.parentOrder)
      if (!parentId) {
        throw new Error(`Parent order ${chunk.parentOrder} not found when inserting child chunk`)
      }
      await client.execute({
        sql: `INSERT INTO session_attachment_chunk
          (attachment_id, parent_id, chunk_order, section_path, page_start, page_end, raw_text, embedded_text, token_estimate)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          attachmentId,
          parentId,
          chunk.chunkOrder,
          chunk.sectionPath ?? null,
          chunk.pageStart ?? null,
          chunk.pageEnd ?? null,
          chunk.rawText,
          chunk.embeddedText,
          chunk.tokenEstimate,
        ],
      })
    }

    return parentIdMap
  })
}

export async function readSessionAttachmentParents(parentIds: number[], allowedAttachmentIds: number[]) {
  if (parentIds.length === 0 || allowedAttachmentIds.length === 0) {
    return []
  }
  const client = getDatabase()
  const parentPlaceholders = parentIds.map(() => '?').join(',')
  const attachmentPlaceholders = allowedAttachmentIds.map(() => '?').join(',')
  const rs = await client.execute({
    sql: `SELECT p.*, a.filename
      FROM session_attachment_parent p
      JOIN session_attachment a ON a.id = p.attachment_id
      WHERE p.id IN (${parentPlaceholders})
        AND p.attachment_id IN (${attachmentPlaceholders})`,
    args: [...parentIds, ...allowedAttachmentIds],
  })
  return rs.rows
}

export async function deleteMessageAttachments(messageId: string): Promise<number[]> {
  const client = getDatabase()
  const rs = await client.execute({
    sql: 'SELECT id FROM session_attachment WHERE message_id = ?',
    args: [messageId],
  })
  const ids = rs.rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id))
  await deleteAttachmentGraphsBatch(ids)
  return ids
}

export async function deleteSessionAttachments(sessionId: string): Promise<number[]> {
  const client = getDatabase()
  const rs = await client.execute({
    sql: 'SELECT id FROM session_attachment WHERE session_id = ?',
    args: [sessionId],
  })
  const ids = rs.rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id))
  await deleteAttachmentGraphsBatch(ids)
  return ids
}

export async function deleteSingleAttachment(attachmentId: number): Promise<void> {
  const existing = await getSessionAttachment(attachmentId)
  if (!existing) {
    return
  }

  if (existing.status === 'pending' || existing.status === 'indexing') {
    await cancelSessionAttachment(attachmentId)
    return
  }

  await deleteAttachmentGraph(attachmentId)
}

export async function clearAllSessionAttachments(): Promise<number> {
  const client = getDatabase()
  const rs = await client.execute({
    sql: 'SELECT id FROM session_attachment',
  })
  const ids = rs.rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id))

  await deleteAttachmentGraphsBatch(ids)

  const orphanIndexTables = await client.execute({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'sa_%' ORDER BY name ASC",
  })
  for (const row of orphanIndexTables.rows) {
    const indexName = String(row.name)
    try {
      await getVectorStore().deleteIndex({ indexName })
    } catch (error) {
      log.warn(`${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Failed to delete orphan vector index ${indexName}:`, error)
    }
  }

  log.info(
    `${SESSION_ATTACHMENT_RAG_LOG_PREFIX} [DB] Cleared all session attachment rag data: attachments=${ids.length}`
  )
  return ids.length
}

export async function cleanupOrphanAttachments(
  validSessionIds: string[],
  validMessageIds: string[]
): Promise<number[]> {
  const client = getDatabase()
  const validSessionIdSet = new Set(validSessionIds)
  const validMessageIdSet = new Set(validMessageIds)
  const rs = await client.execute({
    sql: 'SELECT id, session_id, message_id FROM session_attachment',
  })

  const orphanIds = rs.rows
    .map((row) => ({
      id: Number(row.id),
      sessionId: String(row.session_id),
      messageId: String(row.message_id),
    }))
    .filter((row) => !validSessionIdSet.has(row.sessionId) || !validMessageIdSet.has(row.messageId))
    .map((row) => row.id)

  await deleteAttachmentGraphsBatch(orphanIds)

  return orphanIds
}

export async function getSessionAttachmentDebugSnapshot(): Promise<SessionAttachmentDebugSnapshot> {
  const client = getDatabase()

  const [
    attachmentCountResult,
    parentCountResult,
    chunkCountResult,
    statusCountResult,
    vectorIndexResult,
    recentResult,
  ] = await Promise.all([
    client.execute('SELECT COUNT(*) AS count FROM session_attachment'),
    client.execute('SELECT COUNT(*) AS count FROM session_attachment_parent'),
    client.execute('SELECT COUNT(*) AS count FROM session_attachment_chunk'),
    client.execute('SELECT status, COUNT(*) AS count FROM session_attachment GROUP BY status'),
    client.execute({
      sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'sa_%' ORDER BY name ASC",
    }),
    client.execute({
      sql: `SELECT a.*,
          (SELECT COUNT(*) FROM session_attachment_chunk c WHERE c.attachment_id = a.id) AS chunk_count
          FROM session_attachment a
          WHERE a.status != 'canceled'
          ORDER BY a.id DESC
          LIMIT 20`,
    }),
  ])

  const statusCounts = {
    pending: 0,
    indexing: 0,
    ready: 0,
    failed: 0,
  }

  for (const row of statusCountResult.rows) {
    const status = String(row.status) as keyof typeof statusCounts
    if (status in statusCounts) {
      statusCounts[status] = Number(row.count ?? 0)
    }
  }

  let dbSizeBytes = 0
  try {
    dbSizeBytes = fs.statSync(dbPath).size
  } catch {
    dbSizeBytes = 0
  }

  return {
    dbPath,
    dbSizeBytes,
    attachmentCount: Number(attachmentCountResult.rows[0]?.count ?? 0),
    parentCount: Number(parentCountResult.rows[0]?.count ?? 0),
    chunkCount: Number(chunkCountResult.rows[0]?.count ?? 0),
    vectorIndexNames: vectorIndexResult.rows.map((row) => String(row.name)),
    statusCounts,
    recentAttachments: recentResult.rows.map((row) => {
      const attachment = mapRowToSessionAttachmentRecord(row as Record<string, unknown>)
      return {
        ...attachment,
        status: attachment.status === 'canceled' ? 'failed' : attachment.status,
      }
    }),
  }
}
