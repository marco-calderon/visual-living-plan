import { and, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { STALE_MS } from './registryConstants'
import { isPidAlive } from './pid'
import { finishedPlan, isPlanMode, type PlanMode, type PlanRecord, type ProcessPulse, type ProcessRecord } from './processRecord'
import { keepProgress, metaFromProcess, metaFromRecord, readMeta, type PlanMeta } from './store/meta'
import { migratePlanDatabase } from './store/migrate'
import { planEvents, planRuns, plans } from './store/tables'
import { openSqliteStore } from './store/sqlite'
import type { PlanSubmissionEvent } from './types'

export type StoredPlanSession = {
  id: string
  token: string
  planPath: string
  mode: PlanMode
  iteration: number
  cwd: string
  configPath: string | null
  responsesJson: string
  executionJson: string
  reviewJson: string | null
  commentsJson: string
  startedAt: number
  lastSeenAt: number
}

/** Inclusive window. A finished run overlaps when it started at or before `to` and ended at or after `from`. */
export type RunWindow = {
  from: number
  to: number
}

export type RegistryStore = {
  upsert(record: ProcessRecord): void
  get(id: string): ProcessRecord | undefined
  list(): ProcessRecord[]
  heartbeat(id: string, pulse: ProcessPulse): ProcessRecord | undefined
  remove(id: string): boolean
  prune(options?: { now?: number; staleMs?: number; isAlive?: (pid: number) => boolean }): string[]
  saveSession(session: StoredPlanSession, events?: PlanSubmissionEvent[]): void
  listEvents(planId: string): PlanSubmissionEvent[]
  getSession(id: string): StoredPlanSession | undefined
  getSessionByPath(planPath: string): StoredPlanSession | undefined
  listSessions(): StoredPlanSession[]
  deleteSession(id: string): boolean
  saveRun(record: PlanRecord): void
  listRuns(window?: RunWindow): PlanRecord[]
  close(): void
}

type Database = BunSQLiteDatabase<Record<string, unknown>>
type PlanRow = typeof plans.$inferSelect

const runningProcess = and(eq(plans.status, 'running'), sql`json_extract(${plans.meta}, '$.pid') IS NOT NULL`)

function parsed(value: string, fallback: unknown): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return fallback
  }
}

function toProcess(row: PlanRow): ProcessRecord | undefined {
  const meta = readMeta(row.meta)
  if (meta.pid == null || row.status !== 'running') return undefined
  return {
    id: row.id,
    pid: meta.pid,
    title: row.title,
    summary: meta.summary,
    agent: meta.agent,
    mode: isPlanMode(row.mode) ? row.mode : 'watch',
    planPath: row.planPath ?? '',
    directory: meta.directory,
    cwd: meta.cwd,
    url: meta.url,
    host: meta.host,
    port: meta.port,
    startedAt: row.startedAt,
    heartbeatAt: row.heartbeatAt,
    pendingCount: meta.pendingCount,
    executionActive: meta.executionActive,
    executionStep: meta.executionStep,
    git: meta.git,
  }
}

function toRecord(row: typeof planRuns.$inferSelect): PlanRecord {
  const meta = readMeta(row.meta)
  const mode = isPlanMode(row.mode) ? row.mode : 'watch'
  const status = row.status === 'executed' || row.status === 'interrupted' ? row.status : 'running'
  return {
    id: row.id,
    pid: meta.pid ?? 0,
    title: row.title,
    summary: meta.summary,
    agent: meta.agent,
    mode,
    planPath: row.planPath ?? '',
    directory: meta.directory,
    cwd: meta.cwd,
    url: meta.url,
    host: meta.host,
    port: meta.port,
    startedAt: row.startedAt,
    heartbeatAt: row.heartbeatAt,
    pendingCount: meta.pendingCount,
    executionActive: meta.executionActive,
    executionStep: meta.executionStep,
    git: meta.git,
    status,
    storedPath: meta.storedPath,
    endedAt: row.endedAt,
    durationMs: meta.durationMs,
    phaseTotal: meta.phaseTotal,
    phaseDone: meta.phaseDone,
    interactionTotal: meta.interactionTotal,
    interactionDone: meta.interactionDone,
    completionRatio: meta.completionRatio,
    completionState: meta.completionState,
    filesModified: meta.filesModified,
    outcome: meta.outcome,
  }
}

function toSession(row: PlanRow): StoredPlanSession | undefined {
  if (!row.token) return undefined
  const meta = readMeta(row.meta)
  return {
    id: row.id,
    token: row.token,
    planPath: row.planPath ?? '',
    mode: isPlanMode(row.mode) ? row.mode : 'watch',
    iteration: meta.iteration,
    cwd: meta.cwd,
    configPath: meta.configPath,
    responsesJson: JSON.stringify(meta.responses ?? {}),
    executionJson: JSON.stringify(meta.execution ?? {}),
    reviewJson: meta.review == null ? null : JSON.stringify(meta.review),
    commentsJson: JSON.stringify(meta.comments ?? []),
    startedAt: row.startedAt,
    lastSeenAt: meta.lastSeenAt ?? row.heartbeatAt,
  }
}

function sessionMeta(current: PlanMeta, session: StoredPlanSession): PlanMeta {
  return {
    ...current,
    cwd: session.cwd,
    iteration: session.iteration,
    configPath: session.configPath,
    responses: parsed(session.responsesJson, {}),
    execution: parsed(session.executionJson, {}),
    review: session.reviewJson ? parsed(session.reviewJson, null) : null,
    comments: parsed(session.commentsJson, []),
    lastSeenAt: session.lastSeenAt,
  }
}

export async function openRegistryStore(dbPath: string): Promise<RegistryStore> {
  const sqlite = openSqliteStore(dbPath)
  migratePlanDatabase(sqlite)
  const db: Database = drizzle(sqlite.database)
  let closed = false

  const store: RegistryStore = {
    upsert(record) {
      const incoming = metaFromProcess(record)
      db.transaction((tx) => {
        const existing = tx.select().from(plans).where(eq(plans.id, record.id)).get()
        const meta = existing ? keepProgress(readMeta(existing.meta), incoming) : incoming
        const values = {
          userId: existing?.userId ?? null,
          token: existing?.token ?? null,
          title: record.title,
          mode: record.mode,
          status: existing?.status ?? 'running',
          planPath: record.planPath,
          startedAt: existing?.startedAt ?? record.startedAt,
          endedAt: existing?.endedAt ?? null,
          heartbeatAt: record.heartbeatAt,
          meta,
        }
        if (existing) tx.update(plans).set(values).where(eq(plans.id, record.id)).run()
        else tx.insert(plans).values({ id: record.id, ...values }).run()
      })
    },
    get(id) {
      const row = db.select().from(plans).where(and(eq(plans.id, id), runningProcess)).get()
      return row ? toProcess(row) : undefined
    },
    list() {
      return db
        .select()
        .from(plans)
        .where(runningProcess)
        .orderBy(desc(plans.startedAt))
        .all()
        .flatMap((row) => {
          const record = toProcess(row)
          return record ? [record] : []
        })
    },
    heartbeat(id, pulse) {
      const current = store.get(id)
      if (!current) return undefined
      const next: ProcessRecord = {
        ...current,
        heartbeatAt: pulse.at ?? Date.now(),
        title: pulse.title ?? current.title,
        summary: pulse.summary === undefined ? current.summary : pulse.summary,
        agent: pulse.agent === undefined ? current.agent : pulse.agent,
        pendingCount: pulse.pendingCount ?? current.pendingCount,
        executionActive: pulse.executionActive ?? current.executionActive,
        executionStep: pulse.executionStep === undefined ? current.executionStep : pulse.executionStep,
        git: pulse.git ?? current.git,
      }
      store.upsert(next)
      return store.get(id)
    },
    remove(id) {
      const removed = db.delete(plans).where(eq(plans.id, id)).returning({ id: plans.id }).all()
      return removed.length > 0
    },
    prune(options) {
      const now = options?.now ?? Date.now()
      const staleMs = options?.staleMs ?? STALE_MS
      const alive = options?.isAlive ?? isPidAlive
      const removed: string[] = []
      for (const record of store.list()) {
        const stale = now - record.heartbeatAt > staleMs
        if (stale || !alive(record.pid)) {
          store.saveRun(finishedPlan(record, 'interrupted', null, now))
          store.remove(record.id)
          removed.push(record.id)
        }
      }
      return removed
    },
    saveSession(session, events) {
      db.transaction((tx) => {
        const existing = tx.select().from(plans).where(eq(plans.id, session.id)).get()
        const meta = sessionMeta(existing ? readMeta(existing.meta) : readMeta(null), session)
        const values = {
          userId: existing?.userId ?? null,
          token: session.token,
          title: existing?.title ?? '',
          mode: session.mode,
          status: existing?.status ?? 'running',
          planPath: session.planPath,
          startedAt: existing?.startedAt ?? session.startedAt,
          endedAt: existing?.endedAt ?? null,
          heartbeatAt: existing && readMeta(existing.meta).pid != null ? existing.heartbeatAt : session.lastSeenAt,
          meta,
        }
        if (existing) tx.update(plans).set(values).where(eq(plans.id, session.id)).run()
        else tx.insert(plans).values({ id: session.id, ...values }).run()
        if (!events) return
        for (const event of events) {
          const data = JSON.stringify(event.data)
          const eventValues = {
            planId: session.id,
            seq: event.seq,
            event: event.event,
            data,
            createdAt: event.createdAt,
            deliveredAt: event.deliveredAt,
          }
          const found = tx.select({ id: planEvents.id }).from(planEvents).where(eq(planEvents.id, event.id)).get()
          if (found) tx.update(planEvents).set(eventValues).where(eq(planEvents.id, event.id)).run()
          else tx.insert(planEvents).values({ id: event.id, ...eventValues }).run()
        }
      })
    },
    listEvents(planId) {
      return db
        .select()
        .from(planEvents)
        .where(eq(planEvents.planId, planId))
        .orderBy(planEvents.seq)
        .all()
        .flatMap((row) => {
          if (row.event !== 'interaction' && row.event !== 'review' && row.event !== 'comment') return []
          const data = parsed(row.data, null)
          if (data == null && row.data !== 'null') return []
          return [{ id: row.id, seq: row.seq, event: row.event, data, createdAt: row.createdAt, deliveredAt: row.deliveredAt }]
        })
    },
    getSession(id) {
      const row = db.select().from(plans).where(and(eq(plans.id, id), isNotNull(plans.token))).get()
      return row ? toSession(row) : undefined
    },
    getSessionByPath(planPath) {
      const row = db.select().from(plans).where(and(eq(plans.planPath, planPath), isNotNull(plans.token))).get()
      return row ? toSession(row) : undefined
    },
    listSessions() {
      return db
        .select()
        .from(plans)
        .where(isNotNull(plans.token))
        .orderBy(desc(plans.startedAt))
        .all()
        .flatMap((row) => {
          const session = toSession(row)
          return session ? [session] : []
        })
    },
    deleteSession(id) {
      return db.transaction((tx) => {
        const existing = tx.select().from(plans).where(eq(plans.id, id)).get()
        if (!existing?.token) return false
        tx.delete(planEvents).where(eq(planEvents.planId, id)).run()
        if (readMeta(existing.meta).pid == null) {
          tx.delete(plans).where(eq(plans.id, id)).run()
          return true
        }
        const meta = readMeta(existing.meta)
        tx.update(plans)
          .set({
            token: null,
            meta: { ...meta, responses: {}, execution: {}, review: null, comments: [], configPath: null },
          })
          .where(eq(plans.id, id))
          .run()
        return true
      })
    },
    saveRun(record) {
      const runId = `${record.id}:${record.startedAt}`
      const values = {
        id: record.id,
        userId: null,
        token: null,
        title: record.title,
        mode: record.mode,
        status: record.status,
        planPath: record.planPath,
        startedAt: record.startedAt,
        endedAt: record.endedAt,
        heartbeatAt: record.heartbeatAt,
        meta: metaFromRecord(record),
      }
      const existing = db.select({ runId: planRuns.runId }).from(planRuns).where(eq(planRuns.runId, runId)).get()
      if (existing) db.update(planRuns).set(values).where(eq(planRuns.runId, runId)).run()
      else db.insert(planRuns).values({ runId, ...values }).run()
    },
    listRuns(window) {
      const rows = window
        ? db
            .select()
            .from(planRuns)
            .where(
              and(
                lte(planRuns.startedAt, window.to),
                gte(sql`COALESCE(${planRuns.endedAt}, ${planRuns.heartbeatAt}, ${planRuns.startedAt})`, window.from),
              ),
            )
            .orderBy(desc(planRuns.startedAt))
            .all()
        : db.select().from(planRuns).orderBy(desc(planRuns.startedAt)).all()
      return rows.map((row) => toRecord(row))
    },
    close() {
      if (closed) return
      closed = true
      sqlite.close()
    },
  }

  return store
}
