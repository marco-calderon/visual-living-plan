import { selectRow, selectRows, upsert } from './store/codec'
import { migratePlanDatabase } from './store/migrate'
import {
  EVENT_FIELDS,
  PLAN_FIELDS,
  PLAN_KEEP,
  RUN_FIELDS,
  SESSION_FIELDS,
  type PlanInsert,
  type PlanRow,
  type PlanRunRow,
} from './store/schema'
import { openSqliteStore, type SqliteStore } from './store/sqlite'
import { planInsertFromProcess, planRowToProcess, planRunInsert, planRunRowToRecord } from './store/rows'
import { STALE_MS } from './registryConstants'
import { isPidAlive } from './pid'
import type { PlanMode, ProcessPulse, ProcessRecord } from './processRecord'
import { finishedPlan, isPlanMode } from './processRecord'
import type { PlanRecord } from './processRecord'
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

type SessionRow = StoredPlanSession

type EventRow = {
  id: string
  planId: string
  seq: number
  event: string
  dataJson: string
  createdAt: number
  deliveredAt: number | null
}

function eventValues(planId: string, event: PlanSubmissionEvent): EventRow {
  return {
    id: event.id,
    planId,
    seq: event.seq,
    event: event.event,
    dataJson: JSON.stringify(event.data),
    createdAt: event.createdAt,
    deliveredAt: event.deliveredAt,
  }
}

function toEvent(row: EventRow): PlanSubmissionEvent | null {
  if (row.event !== 'interaction' && row.event !== 'review' && row.event !== 'comment') return null
  let data: unknown = null
  try {
    data = JSON.parse(row.dataJson) as unknown
  } catch {
    return null
  }
  return {
    id: row.id,
    seq: row.seq,
    event: row.event,
    data,
    createdAt: row.createdAt,
    deliveredAt: row.deliveredAt,
  }
}

function toSession(row: SessionRow): StoredPlanSession {
  return {
    id: row.id,
    token: row.token,
    planPath: row.planPath,
    mode: isPlanMode(row.mode) ? row.mode : 'watch',
    iteration: row.iteration,
    cwd: row.cwd,
    configPath: row.configPath,
    responsesJson: row.responsesJson,
    executionJson: row.executionJson,
    reviewJson: row.reviewJson,
    commentsJson: row.commentsJson,
    startedAt: row.startedAt,
    lastSeenAt: row.lastSeenAt,
  }
}

export async function openRegistryStore(dbPath: string): Promise<RegistryStore> {
  const db = openSqliteStore(dbPath)
  migratePlanDatabase(db)
  let closed = false

  const store: RegistryStore = {
    upsert(record) {
      writePlan(db, planInsertFromProcess(record))
    },
    get(id) {
      const row = selectRow<PlanRow>(db, PLAN_FIELDS, 'SELECT * FROM plans WHERE id = ?', [id])
      if (!row || row.status !== 'running') return undefined
      return planRowToProcess(row)
    },
    list() {
      return selectRows<PlanRow>(db, PLAN_FIELDS, `SELECT * FROM plans WHERE status = 'running' ORDER BY started_at DESC`).map((row) =>
        planRowToProcess(row),
      )
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
      const removed = db.prepare('DELETE FROM plans WHERE id = ? RETURNING id').bind(id).all<{ id: string }>()
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
      db.transaction(() => {
        upsert(db, 'plan_sessions', SESSION_FIELDS, session, 'id', ['started_at'])
        if (!events) return
        for (const event of events) {
          upsert(db, 'plan_events', EVENT_FIELDS, eventValues(session.id, event), 'id', [])
        }
      })
    },
    listEvents(planId) {
      return selectRows<EventRow>(db, EVENT_FIELDS, 'SELECT * FROM plan_events WHERE plan_id = ? ORDER BY seq', [planId]).flatMap(
        (row) => {
          const event = toEvent(row)
          return event ? [event] : []
        },
      )
    },
    getSession(id) {
      const row = selectRow<SessionRow>(db, SESSION_FIELDS, 'SELECT * FROM plan_sessions WHERE id = ?', [id])
      return row ? toSession(row) : undefined
    },
    getSessionByPath(planPath) {
      const row = selectRow<SessionRow>(db, SESSION_FIELDS, 'SELECT * FROM plan_sessions WHERE plan_path = ?', [planPath])
      return row ? toSession(row) : undefined
    },
    listSessions() {
      return selectRows<SessionRow>(db, SESSION_FIELDS, 'SELECT * FROM plan_sessions ORDER BY started_at DESC').map((row) =>
        toSession(row),
      )
    },
    deleteSession(id) {
      const removed = db.transaction(() => {
        db.prepare('DELETE FROM plan_events WHERE plan_id = ?').bind(id).run()
        return db.prepare('DELETE FROM plan_sessions WHERE id = ? RETURNING id').bind(id).all<{ id: string }>()
      })
      return removed.length > 0
    },
    saveRun(record) {
      upsert(db, 'plan_runs', RUN_FIELDS, planRunInsert(record), 'run_id', [])
    },
    listRuns(window) {
      const rows = window
        ? selectRows<PlanRunRow>(
            db,
            RUN_FIELDS,
            'SELECT * FROM plan_runs WHERE started_at <= ? AND COALESCE(ended_at, heartbeat_at, started_at) >= ? ORDER BY started_at DESC',
            [window.to, window.from],
          )
        : selectRows<PlanRunRow>(db, RUN_FIELDS, 'SELECT * FROM plan_runs ORDER BY started_at DESC')
      return rows.map((row) => planRunRowToRecord(row))
    },
    close() {
      if (closed) return
      closed = true
      db.close()
    },
  }

  return store
}

function writePlan(db: SqliteStore, values: PlanInsert): void {
  upsert(db, 'plans', PLAN_FIELDS, values, 'id', PLAN_KEEP)
}
