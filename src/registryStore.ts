import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { desc, eq } from 'drizzle-orm'
import { openPlanDatabase } from './db/client.js'
import { planInsertFromProcess, planRowToProcess, planRunInsert, planRunRowToRecord } from './db/rows.js'
import {
  planRuns,
  planSessions,
  plans,
  type PlanInsert,
  type PlanRunInsert,
  type PlanSessionInsert,
  type PlanSessionRow,
} from './db/schema.js'
import { STALE_MS } from './registryConstants.js'
import { isPidAlive } from './pid.js'
import type { PlanRecord, ProcessPulse, ProcessRecord } from './processRecord.js'
import { finishedPlan } from './processRecord.js'

export type StoredPlanSession = {
  id: string
  token: string
  planPath: string
  mode: 'watch' | 'review'
  iteration: number
  cwd: string
  configPath: string | null
  responsesJson: string
  executionJson: string
  reviewJson: string | null
  startedAt: number
  lastSeenAt: number
}

export type RegistryStore = {
  upsert(record: ProcessRecord): void
  get(id: string): ProcessRecord | undefined
  list(): ProcessRecord[]
  heartbeat(id: string, pulse: ProcessPulse): ProcessRecord | undefined
  remove(id: string): boolean
  prune(options?: { now?: number; staleMs?: number; isAlive?: (pid: number) => boolean }): string[]
  saveSession(session: StoredPlanSession): void
  getSession(id: string): StoredPlanSession | undefined
  getSessionByPath(planPath: string): StoredPlanSession | undefined
  listSessions(): StoredPlanSession[]
  deleteSession(id: string): boolean
  saveRun(record: PlanRecord): void
  listRuns(): PlanRecord[]
  close(): void
}

function sessionValues(session: StoredPlanSession): PlanSessionInsert {
  return {
    id: session.id,
    token: session.token,
    planPath: session.planPath,
    mode: session.mode,
    iteration: session.iteration,
    cwd: session.cwd,
    configPath: session.configPath,
    responsesJson: session.responsesJson,
    executionJson: session.executionJson,
    reviewJson: session.reviewJson,
    startedAt: session.startedAt,
    lastSeenAt: session.lastSeenAt,
  }
}

function toSession(row: PlanSessionRow): StoredPlanSession {
  return {
    id: row.id,
    token: row.token,
    planPath: row.planPath,
    mode: row.mode === 'review' ? 'review' : 'watch',
    iteration: row.iteration,
    cwd: row.cwd,
    configPath: row.configPath,
    responsesJson: row.responsesJson,
    executionJson: row.executionJson,
    reviewJson: row.reviewJson,
    startedAt: row.startedAt,
    lastSeenAt: row.lastSeenAt,
  }
}

/** Fields replaced on conflict. `startedAt` and progress counters stay as first written. */
function livePlanUpdate(values: PlanInsert): Omit<
  PlanInsert,
  | 'id'
  | 'startedAt'
  | 'status'
  | 'storedPath'
  | 'endedAt'
  | 'durationMs'
  | 'phaseTotal'
  | 'phaseDone'
  | 'interactionTotal'
  | 'interactionDone'
  | 'completionRatio'
  | 'completionState'
  | 'outcome'
> {
  const {
    id: _id,
    startedAt: _startedAt,
    status: _status,
    storedPath: _storedPath,
    endedAt: _endedAt,
    durationMs: _durationMs,
    phaseTotal: _phaseTotal,
    phaseDone: _phaseDone,
    interactionTotal: _interactionTotal,
    interactionDone: _interactionDone,
    completionRatio: _completionRatio,
    completionState: _completionState,
    outcome: _outcome,
    ...set
  } = values
  return set
}

function sessionUpdate(values: PlanSessionInsert): Omit<PlanSessionInsert, 'id' | 'startedAt'> {
  const { id: _id, startedAt: _startedAt, ...set } = values
  return set
}

function runUpdate(values: PlanRunInsert): Omit<PlanRunInsert, 'runId'> {
  const { runId: _runId, ...set } = values
  return set
}

export async function openRegistryStore(dbPath: string): Promise<RegistryStore> {
  if (dbPath !== ':memory:') {
    await mkdir(dirname(dbPath), { recursive: true })
  }
  const opened = openPlanDatabase(dbPath)
  const db = opened.db
  let closed = false

  const store: RegistryStore = {
    upsert(record) {
      const values = planInsertFromProcess(record)
      db.insert(plans)
        .values(values)
        .onConflictDoUpdate({
          target: plans.id,
          set: livePlanUpdate(values),
        })
        .run()
    },
    get(id) {
      const row = db.select().from(plans).where(eq(plans.id, id)).get()
      if (!row || row.status !== 'running') return undefined
      return planRowToProcess(row)
    },
    list() {
      return db
        .select()
        .from(plans)
        .where(eq(plans.status, 'running'))
        .orderBy(desc(plans.startedAt))
        .all()
        .map((row) => planRowToProcess(row))
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
    saveSession(session) {
      const values = sessionValues(session)
      db.insert(planSessions)
        .values(values)
        .onConflictDoUpdate({
          target: planSessions.id,
          set: sessionUpdate(values),
        })
        .run()
    },
    getSession(id) {
      const row = db.select().from(planSessions).where(eq(planSessions.id, id)).get()
      return row ? toSession(row) : undefined
    },
    getSessionByPath(planPath) {
      const row = db.select().from(planSessions).where(eq(planSessions.planPath, planPath)).get()
      return row ? toSession(row) : undefined
    },
    listSessions() {
      return db
        .select()
        .from(planSessions)
        .orderBy(desc(planSessions.startedAt))
        .all()
        .map((row) => toSession(row))
    },
    deleteSession(id) {
      const removed = db.delete(planSessions).where(eq(planSessions.id, id)).returning({ id: planSessions.id }).all()
      return removed.length > 0
    },
    saveRun(record) {
      const values = planRunInsert(record)
      db.insert(planRuns)
        .values(values)
        .onConflictDoUpdate({
          target: planRuns.runId,
          set: runUpdate(values),
        })
        .run()
    },
    listRuns() {
      return db
        .select()
        .from(planRuns)
        .orderBy(desc(planRuns.startedAt))
        .all()
        .map((row) => planRunRowToRecord(row))
    },
    close() {
      if (closed) return
      closed = true
      opened.close()
    },
  }

  return store
}
