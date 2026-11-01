import { desc, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { nanoid } from 'nanoid'
import { migratePlanDatabase } from './store/migrate'
import { openSqliteStore } from './store/sqlite'
import { planVersions } from './store/tables'

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

const maxTitle = 200
const maxBody = 500_000

export type PlanSnapshotStore = {
  sync: (title: string, body: string) => PlanSnapshotChange
  restore: (snapshotId: string) => PlanSnapshotChange
  list: () => PlanSnapshotRecord[]
  head: () => PlanSnapshotDocument | null
  close: () => void
}

/** Append-only plan source history in the shared `plan_versions` table. */
export function openPlanSnapshots(path: string, documentId: string): PlanSnapshotStore {
  const sqlite = openSqliteStore(path)
  migratePlanDatabase(sqlite)
  const db = drizzle(sqlite.database)

  return {
    sync(title, body) {
      const current = readDocument(db, documentId)
      const nextTitle = checkedTitle(title)
      const nextBody = checkedBody(body)
      if (!current) return insertChange(db, documentId, 'create', nextTitle, nextBody, null, null)
      if (current.title === nextTitle && current.body === nextBody) return { changed: false, plan: current, snapshot: null }
      return insertChange(db, documentId, 'edit', nextTitle, nextBody, current.headSnapshotId, null)
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
      sqlite.close()
    },
  }
}

type Database = ReturnType<typeof drizzle>

function insertChange(
  db: Database,
  documentId: string,
  reason: PlanSnapshotReason,
  title: string,
  body: string,
  parentId: string | null,
  restoredFromId: string | null,
): PlanSnapshotChange {
  const now = Date.now()
  const snapshotId = `snap_${nanoid(12)}`
  const latest = db
    .select({ seq: planVersions.seq })
    .from(planVersions)
    .where(eq(planVersions.planId, documentId))
    .orderBy(desc(planVersions.seq))
    .limit(1)
    .get()
  const seq = (latest?.seq ?? 0) + 1
  db.insert(planVersions)
    .values({ id: snapshotId, planId: documentId, seq, title, body, createdAt: now, parentId, reason, restoredFromId })
    .run()
  const plan = readDocument(db, documentId)
  const snapshot = readSnapshot(db, snapshotId)
  if (!plan || !snapshot) throw new Error('Snapshot write did not persist')
  return { changed: true, plan, snapshot }
}

function readDocument(db: Database, id: string): PlanSnapshotDocument | null {
  const rows = db.select().from(planVersions).where(eq(planVersions.planId, id)).orderBy(planVersions.seq).all()
  const head = rows.at(-1)
  const first = rows[0]
  if (!head || !first) return null
  return {
    id,
    title: head.title,
    body: head.body,
    createdAt: first.createdAt,
    updatedAt: head.createdAt,
    headSnapshotId: head.id,
  }
}

function readSnapshot(db: Database, id: string): PlanSnapshotRecord | null {
  const row = db.select().from(planVersions).where(eq(planVersions.id, id)).get()
  return row ? mapSnapshot(row) : null
}

function listSnapshots(db: Database, documentId: string): PlanSnapshotRecord[] {
  return db
    .select()
    .from(planVersions)
    .where(eq(planVersions.planId, documentId))
    .orderBy(planVersions.seq)
    .all()
    .map(mapSnapshot)
}

function mapSnapshot(row: typeof planVersions.$inferSelect): PlanSnapshotRecord {
  const reason = row.reason === 'edit' || row.reason === 'restore' ? row.reason : 'create'
  return {
    id: row.id,
    documentId: row.planId,
    seq: row.seq,
    parentId: row.parentId,
    title: row.title,
    body: row.body,
    reason,
    restoredFromId: row.restoredFromId,
    createdAt: row.createdAt,
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
