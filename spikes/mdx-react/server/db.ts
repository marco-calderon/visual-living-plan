import { Database } from 'bun:sqlite'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SpikeError } from './errors'
import {
  isClientEventName,
  maxBodyLength,
  maxTitleLength,
  samplePlanId,
  sampleSnapshotId,
  type ApplyResult,
  type PlanDocument,
  type SnapshotReason,
  type SnapshotRecord,
} from './protocol'

export type { ApplyResult }

type DocumentRow = {
  id: string
  title: string
  body: string
  created_at: number
  updated_at: number
  head_snapshot_id: string | null
}

type SnapshotRow = {
  id: string
  document_id: string
  seq: number
  parent_id: string | null
  title: string
  body: string
  reason: string
  restored_from_id: string | null
  created_at: number
}

type CountRow = { count: number }
type SeqRow = { seq: number }

export type SpikeDb = {
  hello: () => { plans: PlanDocument[]; snapshots: SnapshotRecord[] }
  listDocuments: () => PlanDocument[]
  getDocument: (id: string) => PlanDocument | null
  listSnapshots: (documentId?: string) => SnapshotRecord[]
  apply: (event: string, data: unknown) => ApplyResult
  close: () => void
}

const sampleBody = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../mdx/sample-plan.mdx'), 'utf8')
const sampleTitle = 'Rate limiting rollout'

export function defaultDbPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'data', 'plans.sqlite')
}

export function openSpikeDb(path: string, seed: boolean): SpikeDb {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS plan_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      head_snapshot_id TEXT
    );

    CREATE TABLE IF NOT EXISTS plan_snapshots (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES plan_documents(id),
      seq INTEGER NOT NULL,
      parent_id TEXT REFERENCES plan_snapshots(id),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('create', 'edit', 'restore')),
      restored_from_id TEXT REFERENCES plan_snapshots(id),
      created_at INTEGER NOT NULL,
      UNIQUE (document_id, seq)
    );

    CREATE INDEX IF NOT EXISTS plan_snapshots_document_seq
      ON plan_snapshots (document_id, seq);
  `)
  db.exec('PRAGMA user_version = 1')
  if (seed) seedSample(db)

  return {
    hello() {
      return { plans: listDocuments(db), snapshots: listSnapshots(db) }
    },
    listDocuments() {
      return listDocuments(db)
    },
    getDocument(id) {
      return getDocument(db, id)
    },
    listSnapshots(documentId) {
      return listSnapshots(db, documentId)
    },
    apply(event, data) {
      return applyEvent(db, event, data)
    },
    close() {
      db.close()
    },
  }
}

function seedSample(db: Database): void {
  const row = db.query<CountRow, []>('SELECT COUNT(*) AS count FROM plan_documents').get()
  if ((row?.count ?? 0) > 0) return
  insertDocument(db, {
    id: samplePlanId,
    snapshotId: sampleSnapshotId,
    title: sampleTitle,
    body: sampleBody,
    reason: 'create',
    parentId: null,
    restoredFromId: null,
    seq: 1,
  })
}

function applyEvent(db: Database, event: string, data: unknown): ApplyResult {
  if (!isClientEventName(event)) throw new SpikeError(400, `Unknown event: ${event}`)
  if (event === 'create') return createDocument(db, data)
  if (event === 'edit') return editDocument(db, data)
  return restoreDocument(db, data)
}

function createDocument(db: Database, data: unknown): ApplyResult {
  const record = requireData(data)
  const title = cleanTitle(requireString(record, 'title'))
  const body = cleanBody(requireString(record, 'body'))
  return insertDocument(db, {
    id: `plan_${crypto.randomUUID()}`,
    snapshotId: `snap_${crypto.randomUUID()}`,
    title,
    body,
    reason: 'create',
    parentId: null,
    restoredFromId: null,
    seq: 1,
  })
}

function editDocument(db: Database, data: unknown): ApplyResult {
  const record = requireData(data)
  const planId = requireId(record, 'planId')
  const body = cleanBody(requireString(record, 'body'))
  const titleInput = optionalString(record, 'title')
  const existing = getDocument(db, planId)
  if (!existing) throw new SpikeError(404, 'Plan not found')
  const title = titleInput === undefined ? existing.title : cleanTitle(titleInput)
  if (title === existing.title && body === existing.body) {
    return { changed: false, plan: existing, snapshot: null }
  }
  return insertSnapshotAndHead(db, {
    id: existing.id,
    snapshotId: `snap_${crypto.randomUUID()}`,
    title,
    body,
    reason: 'edit',
    parentId: existing.headSnapshotId,
    restoredFromId: null,
  })
}

function restoreDocument(db: Database, data: unknown): ApplyResult {
  const record = requireData(data)
  const planId = requireId(record, 'planId')
  const snapshotId = requireId(record, 'snapshotId')
  const existing = getDocument(db, planId)
  if (!existing) throw new SpikeError(404, 'Plan not found')
  const source = getSnapshot(db, snapshotId)
  if (!source || source.documentId !== planId) throw new SpikeError(404, 'Snapshot not found')
  if (source.id === existing.headSnapshotId) {
    return { changed: false, plan: existing, snapshot: null }
  }
  return insertSnapshotAndHead(db, {
    id: existing.id,
    snapshotId: `snap_${crypto.randomUUID()}`,
    title: source.title,
    body: source.body,
    reason: 'restore',
    parentId: existing.headSnapshotId,
    restoredFromId: source.id,
  })
}

type InsertNew = {
  id: string
  snapshotId: string
  title: string
  body: string
  reason: SnapshotReason
  parentId: string | null
  restoredFromId: string | null
  seq: number
}

function insertDocument(db: Database, input: InsertNew): ApplyResult {
  const now = Date.now()
  const tx = db.transaction(() => {
    db.query(
      `INSERT INTO plan_documents (id, title, body, created_at, updated_at, head_snapshot_id)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    ).run(input.id, input.title, input.body, now, now)
    db.query(
      `INSERT INTO plan_snapshots (
         id, document_id, seq, parent_id, title, body, reason, restored_from_id, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.snapshotId,
      input.id,
      input.seq,
      input.parentId,
      input.title,
      input.body,
      input.reason,
      input.restoredFromId,
      now,
    )
    db.query('UPDATE plan_documents SET head_snapshot_id = ? WHERE id = ?').run(input.snapshotId, input.id)
    return readResult(db, input.id, input.snapshotId)
  })
  return tx()
}

function insertSnapshotAndHead(db: Database, input: Omit<InsertNew, 'seq'>): ApplyResult {
  const now = Date.now()
  const tx = db.transaction(() => {
    const seq = nextSeq(db, input.id)
    db.query(
      `INSERT INTO plan_snapshots (
         id, document_id, seq, parent_id, title, body, reason, restored_from_id, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.snapshotId,
      input.id,
      seq,
      input.parentId,
      input.title,
      input.body,
      input.reason,
      input.restoredFromId,
      now,
    )
    db.query(
      `UPDATE plan_documents
       SET title = ?, body = ?, updated_at = ?, head_snapshot_id = ?
       WHERE id = ?`,
    ).run(input.title, input.body, now, input.snapshotId, input.id)
    return readResult(db, input.id, input.snapshotId)
  })
  return tx()
}

function readResult(db: Database, planId: string, snapshotId: string): ApplyResult {
  const plan = getDocument(db, planId)
  const snapshot = getSnapshot(db, snapshotId)
  if (!plan || !snapshot) throw new SpikeError(500, 'Wrote a plan that could not be read back')
  return { changed: true, plan, snapshot }
}

function listDocuments(db: Database): PlanDocument[] {
  const rows = db
    .query<DocumentRow, []>('SELECT * FROM plan_documents ORDER BY created_at ASC, id ASC')
    .all()
  return rows.map(toPlan)
}

function getDocument(db: Database, id: string): PlanDocument | null {
  const row = db.query<DocumentRow, [string]>('SELECT * FROM plan_documents WHERE id = ?').get(id)
  return row ? toPlan(row) : null
}

function listSnapshots(db: Database, documentId?: string): SnapshotRecord[] {
  const rows = documentId
    ? db
        .query<SnapshotRow, [string]>(
          'SELECT * FROM plan_snapshots WHERE document_id = ? ORDER BY seq ASC',
        )
        .all(documentId)
    : db.query<SnapshotRow, []>('SELECT * FROM plan_snapshots ORDER BY document_id ASC, seq ASC').all()
  return rows.map(toSnapshot)
}

function getSnapshot(db: Database, id: string): SnapshotRecord | null {
  const row = db.query<SnapshotRow, [string]>('SELECT * FROM plan_snapshots WHERE id = ?').get(id)
  return row ? toSnapshot(row) : null
}

function nextSeq(db: Database, documentId: string): number {
  const row = db
    .query<SeqRow, [string]>('SELECT COALESCE(MAX(seq), 0) AS seq FROM plan_snapshots WHERE document_id = ?')
    .get(documentId)
  return (row?.seq ?? 0) + 1
}

function toPlan(row: DocumentRow): PlanDocument {
  if (!row.head_snapshot_id) throw new SpikeError(500, 'Plan is missing its head snapshot')
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    headSnapshotId: row.head_snapshot_id,
  }
}

function toSnapshot(row: SnapshotRow): SnapshotRecord {
  return {
    id: row.id,
    documentId: row.document_id,
    seq: row.seq,
    parentId: row.parent_id,
    title: row.title,
    body: row.body,
    reason: snapshotReason(row.reason),
    restoredFromId: row.restored_from_id,
    createdAt: row.created_at,
  }
}

function snapshotReason(value: string): SnapshotReason {
  if (value === 'create' || value === 'edit' || value === 'restore') return value
  throw new SpikeError(500, 'Stored snapshot reason is invalid')
}

function requireData(data: unknown): Record<string, unknown> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new SpikeError(400, 'Event data must be an object')
  }
  return data as Record<string, unknown>
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string') throw new SpikeError(400, `${key} must be a string`)
  return value
}

function requireId(record: Record<string, unknown>, key: string): string {
  const value = requireString(record, key)
  if (!value) throw new SpikeError(400, `${key} must be a string`)
  return value
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  if (!(key in record) || record[key] === undefined) return undefined
  const value = record[key]
  if (typeof value !== 'string') throw new SpikeError(400, `${key} must be a string`)
  return value
}

function cleanTitle(value: string): string {
  const title = value.trim()
  if (!title) throw new SpikeError(400, 'title must not be empty')
  if (title.length > maxTitleLength) throw new SpikeError(400, 'title is too long')
  return title
}

function cleanBody(value: string): string {
  if (value.length > maxBodyLength) throw new SpikeError(400, 'body is too long')
  return value
}
