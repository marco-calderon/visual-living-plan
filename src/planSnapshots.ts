import { nanoid } from 'nanoid'
import { openSqliteStore, type SqliteStore } from './store/sqlite'

export type PlanSnapshotReason = 'create' | 'edit' | 'restore'

export type PlanSnapshotDocument = {
  id: string
  title: string
  body: string
  createdAt: number
  updatedAt: number
  headSnapshotId: string
}

export type PlanSnapshotRecord = {
  id: string
  documentId: string
  seq: number
  parentId: string | null
  title: string
  body: string
  reason: PlanSnapshotReason
  restoredFromId: string | null
  createdAt: number
}

export type PlanSnapshotChange = {
  changed: boolean
  plan: PlanSnapshotDocument
  snapshot: PlanSnapshotRecord | null
}

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

const maxTitle = 200
const maxBody = 500_000

export type PlanSnapshotStore = {
  sync: (title: string, body: string) => PlanSnapshotChange
  restore: (snapshotId: string) => PlanSnapshotChange
  list: () => PlanSnapshotRecord[]
  head: () => PlanSnapshotDocument | null
  close: () => void
}

/** Append-only plan source history in the shared SQLite store. One document id per plan. */
export function openPlanSnapshots(path: string, documentId: string): PlanSnapshotStore {
  const db = openSqliteStore(path)
  db.exec('PRAGMA foreign_keys = ON')
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
  `)

  return {
    sync(title, body) {
      const current = readDocument(db, documentId)
      if (!current) return insertChange(db, documentId, 'create', checkedTitle(title), checkedBody(body), null, null)
      if (current.title === checkedTitle(title) && current.body === body) {
        return { changed: false, plan: current, snapshot: null }
      }
      return insertChange(db, documentId, 'edit', checkedTitle(title), checkedBody(body), current.headSnapshotId, null)
    },
    restore(snapshotId) {
      const current = readDocument(db, documentId)
      if (!current) throw new Error('Plan snapshot document is missing')
      const snapshot = readSnapshot(db, snapshotId)
      if (!snapshot || snapshot.documentId !== documentId) throw new Error('Snapshot not found')
      if (snapshot.id === current.headSnapshotId) return { changed: false, plan: current, snapshot: null }
      return insertChange(db, documentId, 'restore', snapshot.title, snapshot.body, current.headSnapshotId, snapshot.id)
    },
    list: () => listSnapshots(db, documentId),
    head: () => readDocument(db, documentId),
    close() {
      db.close()
    },
  }
}

function insertChange(
  db: SqliteStore,
  documentId: string,
  reason: PlanSnapshotReason,
  title: string,
  body: string,
  parentId: string | null,
  restoredFromId: string | null,
): PlanSnapshotChange {
  const now = Date.now()
  const snapshotId = `snap_${nanoid(12)}`
  const seqRow = db
    .prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM plan_snapshots WHERE document_id = ?')
    .bind(documentId)
    .get<{ seq: number }>()
  const seq = (seqRow?.seq ?? 0) + 1
  db.transaction(() => {
    if (reason === 'create') {
      db.prepare(
        `INSERT INTO plan_documents (id, title, body, created_at, updated_at, head_snapshot_id)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      ).run(documentId, title, body, now, now)
    }
    db.prepare(
      `INSERT INTO plan_snapshots (
        id, document_id, seq, parent_id, title, body, reason, restored_from_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(snapshotId, documentId, seq, parentId, title, body, reason, restoredFromId, now)
    db.prepare(`UPDATE plan_documents SET title = ?, body = ?, updated_at = ?, head_snapshot_id = ? WHERE id = ?`).run(
      title,
      body,
      now,
      snapshotId,
      documentId,
    )
  })
  const plan = readDocument(db, documentId)
  const snapshot = readSnapshot(db, snapshotId)
  if (!plan || !snapshot) throw new Error('Snapshot write did not persist')
  return { changed: true, plan, snapshot }
}

function readDocument(db: SqliteStore, id: string): PlanSnapshotDocument | null {
  const row = db.prepare('SELECT * FROM plan_documents WHERE id = ?').bind(id).get<DocumentRow>()
  if (!row || !row.head_snapshot_id) return null
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    headSnapshotId: row.head_snapshot_id,
  }
}

function readSnapshot(db: SqliteStore, id: string): PlanSnapshotRecord | null {
  const row = db.prepare('SELECT * FROM plan_snapshots WHERE id = ?').bind(id).get<SnapshotRow>()
  return row ? mapSnapshot(row) : null
}

function listSnapshots(db: SqliteStore, documentId: string): PlanSnapshotRecord[] {
  const rows = db
    .prepare('SELECT * FROM plan_snapshots WHERE document_id = ? ORDER BY seq ASC')
    .bind(documentId)
    .all<SnapshotRow>()
  return rows.map(mapSnapshot)
}

function mapSnapshot(row: SnapshotRow): PlanSnapshotRecord {
  const reason = row.reason === 'edit' || row.reason === 'restore' ? row.reason : 'create'
  return {
    id: row.id,
    documentId: row.document_id,
    seq: row.seq,
    parentId: row.parent_id,
    title: row.title,
    body: row.body,
    reason,
    restoredFromId: row.restored_from_id,
    createdAt: row.created_at,
  }
}

function checkedTitle(title: string): string {
  const trimmed = title.trim() || 'Untitled plan'
  return trimmed.slice(0, maxTitle)
}

function checkedBody(body: string): string {
  if (body.length > maxBody) throw new Error('Plan source is too large to snapshot')
  return body
}
