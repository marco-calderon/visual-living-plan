import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { desc, eq } from 'drizzle-orm'
import { buildDashboard, type DashboardPayload, type DashboardPeriod } from './dashboard.js'
import { openPlanDatabase } from './db/client.js'
import { plans } from './db/schema.js'
import { isPidAlive } from './pid.js'
import type {
  CompletionState,
  GitSnapshot,
  PlanRecord,
  PlanStatus,
  ProcessPulse,
  ProcessRecord,
  ReviewOutcome,
} from './processRecord.js'
import { emptyGitSnapshot } from './processRecord.js'
import { STALE_MS } from './registryConstants.js'

type PlanRow = typeof plans.$inferSelect

export type PlanWrite = ProcessRecord & Partial<PlanRecord>

export type RegistryStore = {
  upsert(record: PlanWrite): void
  get(id: string): PlanRecord | undefined
  /** Running plans only. Finished runs stay in `listPlans`. */
  list(): PlanRecord[]
  listPlans(): PlanRecord[]
  heartbeat(id: string, pulse: ProcessPulse): PlanRecord | undefined
  finish(id: string, status: 'executed' | 'interrupted', outcome?: ReviewOutcome | null): boolean
  /** Mark a running plan executed. The row stays for the dashboard. */
  remove(id: string, outcome?: ReviewOutcome | null): boolean
  setStoredPath(id: string, storedPath: string): void
  prune(options?: { now?: number; staleMs?: number; isAlive?: (pid: number) => boolean }): string[]
  dashboard(period: DashboardPeriod, now?: number): DashboardPayload
  close(): void
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function asStatus(value: string | undefined): PlanStatus {
  if (value === 'executed' || value === 'interrupted' || value === 'running') return value
  return 'running'
}

function asCompletion(value: string | undefined): CompletionState {
  if (value === 'idle' || value === 'in_progress' || value === 'partial' || value === 'complete') return value
  return 'idle'
}

function asOutcome(value: string | null | undefined): ReviewOutcome | null {
  if (value === 'approve' || value === 'deny' || value === 'iterate') return value
  return null
}

function parsePaths(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return []
  }
}

function rowToPlan(row: PlanRow): PlanRecord {
  const status = asStatus(row.status)
  const git: GitSnapshot = {
    isRepo: row.gitIsRepo,
    root: row.gitRoot,
    branch: row.gitBranch,
    commit: row.gitCommit,
    dirty: row.gitDirty,
    ahead: row.gitAhead,
    behind: row.gitBehind,
    changedFiles: row.gitChangedFiles,
    changedPaths: parsePaths(row.gitPaths),
    summary: row.gitSummary,
  }
  return {
    id: row.id,
    pid: row.pid ?? 0,
    title: row.title,
    summary: row.summary,
    agent: row.agent,
    mode: row.mode === 'review' ? 'review' : 'watch',
    status,
    planPath: row.planPath,
    storedPath: row.storedPath,
    directory: row.directory,
    cwd: row.cwd,
    url: row.url,
    host: row.host,
    port: row.port,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    heartbeatAt: row.heartbeatAt,
    durationMs: status === 'running' ? Math.max(0, Date.now() - row.startedAt) : row.durationMs,
    pendingCount: row.pendingCount,
    phaseTotal: row.phaseTotal,
    phaseDone: row.phaseDone,
    interactionTotal: row.interactionTotal,
    interactionDone: row.interactionDone,
    completionRatio: row.completionRatio,
    completionState: asCompletion(row.completionState),
    executionActive: row.executionActive,
    executionStep: row.executionStep,
    filesModified: row.filesModified,
    outcome: asOutcome(row.outcome),
    git,
  }
}

function materialize(input: PlanWrite, existing: PlanRecord | undefined): PlanRecord {
  const git = input.git ?? existing?.git ?? emptyGitSnapshot()
  const reportedFiles = input.filesModified ?? git.changedFiles
  return {
    id: input.id,
    pid: input.pid,
    title: input.title,
    summary: input.summary ?? null,
    agent: input.agent ?? null,
    mode: input.mode === 'review' ? 'review' : 'watch',
    planPath: input.planPath,
    directory: input.directory,
    cwd: input.cwd,
    url: input.url,
    host: input.host,
    port: input.port,
    startedAt: existing?.startedAt ?? input.startedAt,
    heartbeatAt: input.heartbeatAt,
    pendingCount: input.pendingCount ?? existing?.pendingCount ?? 0,
    executionActive: input.executionActive ?? existing?.executionActive ?? false,
    executionStep: input.executionStep === undefined ? (existing?.executionStep ?? null) : input.executionStep,
    git,
    status: asStatus(input.status ?? existing?.status),
    storedPath: input.storedPath === undefined ? (existing?.storedPath ?? null) : input.storedPath,
    endedAt: input.endedAt === undefined ? (existing?.endedAt ?? null) : input.endedAt,
    durationMs: input.durationMs ?? existing?.durationMs ?? 0,
    phaseTotal: input.phaseTotal ?? existing?.phaseTotal ?? 0,
    phaseDone: input.phaseDone ?? existing?.phaseDone ?? 0,
    interactionTotal: input.interactionTotal ?? existing?.interactionTotal ?? 0,
    interactionDone: input.interactionDone ?? existing?.interactionDone ?? 0,
    completionRatio: clampRatio(input.completionRatio ?? existing?.completionRatio ?? 0),
    completionState: asCompletion(input.completionState ?? existing?.completionState),
    filesModified: existing ? Math.max(existing.filesModified, reportedFiles) : reportedFiles,
    outcome: input.outcome === undefined ? (existing?.outcome ?? null) : asOutcome(input.outcome),
  }
}

export async function openRegistryStore(dbPath: string): Promise<RegistryStore> {
  if (dbPath !== ':memory:') {
    await mkdir(dirname(dbPath), { recursive: true })
  }
  const { sqlite, db } = openPlanDatabase(dbPath)
  let closed = false

  function write(record: PlanRecord): void {
    const row = {
      id: record.id,
      pid: record.pid,
      title: record.title,
      summary: record.summary,
      agent: record.agent,
      mode: record.mode,
      status: record.status,
      planPath: record.planPath,
      storedPath: record.storedPath,
      directory: record.directory,
      cwd: record.cwd,
      url: record.url,
      host: record.host,
      port: record.port,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      heartbeatAt: record.heartbeatAt,
      durationMs: record.durationMs,
      pendingCount: record.pendingCount,
      phaseTotal: record.phaseTotal,
      phaseDone: record.phaseDone,
      interactionTotal: record.interactionTotal,
      interactionDone: record.interactionDone,
      completionRatio: record.completionRatio,
      completionState: record.completionState,
      executionActive: record.executionActive,
      executionStep: record.executionStep,
      filesModified: record.filesModified,
      outcome: record.outcome,
      gitIsRepo: record.git.isRepo,
      gitRoot: record.git.root,
      gitBranch: record.git.branch,
      gitCommit: record.git.commit,
      gitDirty: record.git.dirty,
      gitAhead: record.git.ahead,
      gitBehind: record.git.behind,
      gitChangedFiles: record.git.changedFiles,
      gitPaths: JSON.stringify(record.git.changedPaths),
      gitSummary: record.git.summary,
    }
    db.insert(plans)
      .values(row)
      .onConflictDoUpdate({
        target: plans.id,
        set: {
          pid: row.pid,
          title: row.title,
          summary: row.summary,
          agent: row.agent,
          mode: row.mode,
          status: row.status,
          planPath: row.planPath,
          storedPath: row.storedPath,
          directory: row.directory,
          cwd: row.cwd,
          url: row.url,
          host: row.host,
          port: row.port,
          endedAt: row.endedAt,
          heartbeatAt: row.heartbeatAt,
          durationMs: row.durationMs,
          pendingCount: row.pendingCount,
          phaseTotal: row.phaseTotal,
          phaseDone: row.phaseDone,
          interactionTotal: row.interactionTotal,
          interactionDone: row.interactionDone,
          completionRatio: row.completionRatio,
          completionState: row.completionState,
          executionActive: row.executionActive,
          executionStep: row.executionStep,
          filesModified: row.filesModified,
          outcome: row.outcome,
          gitIsRepo: row.gitIsRepo,
          gitRoot: row.gitRoot,
          gitBranch: row.gitBranch,
          gitCommit: row.gitCommit,
          gitDirty: row.gitDirty,
          gitAhead: row.gitAhead,
          gitBehind: row.gitBehind,
          gitChangedFiles: row.gitChangedFiles,
          gitPaths: row.gitPaths,
          gitSummary: row.gitSummary,
        },
      })
      .run()
  }

  const store: RegistryStore = {
    upsert(record) {
      write(materialize(record, store.get(record.id)))
    },
    get(id) {
      const row = db.select().from(plans).where(eq(plans.id, id)).get()
      return row ? rowToPlan(row) : undefined
    },
    list() {
      return db
        .select()
        .from(plans)
        .where(eq(plans.status, 'running'))
        .orderBy(desc(plans.startedAt))
        .all()
        .map(rowToPlan)
    },
    listPlans() {
      return db.select().from(plans).orderBy(desc(plans.startedAt)).all().map(rowToPlan)
    },
    heartbeat(id, pulse) {
      const current = store.get(id)
      if (!current) return undefined
      const at = pulse.at ?? Date.now()
      const nextGit = pulse.git ?? current.git
      store.upsert({
        ...current,
        heartbeatAt: at,
        title: pulse.title ?? current.title,
        summary: pulse.summary === undefined ? current.summary : pulse.summary,
        agent: pulse.agent === undefined ? current.agent : pulse.agent,
        pendingCount: pulse.pendingCount ?? current.pendingCount,
        executionActive: pulse.executionActive ?? current.executionActive,
        executionStep: pulse.executionStep === undefined ? current.executionStep : pulse.executionStep,
        git: nextGit,
        status: 'running',
        endedAt: null,
        durationMs: Math.max(0, at - current.startedAt),
        phaseTotal: pulse.phaseTotal ?? current.phaseTotal,
        phaseDone: pulse.phaseDone ?? current.phaseDone,
        interactionTotal: pulse.interactionTotal ?? current.interactionTotal,
        interactionDone: pulse.interactionDone ?? current.interactionDone,
        completionRatio: pulse.completionRatio ?? current.completionRatio,
        completionState: pulse.completionState ?? current.completionState,
        filesModified: pulse.filesModified ?? nextGit.changedFiles,
        outcome: null,
      })
      return store.get(id)
    },
    finish(id, status, outcome = null) {
      const current = store.get(id)
      if (!current || current.status !== 'running') return false
      const endedAt = status === 'interrupted' ? current.heartbeatAt : Date.now()
      db.update(plans)
        .set({
          status,
          endedAt,
          durationMs: Math.max(0, endedAt - current.startedAt),
          executionActive: false,
          outcome,
        })
        .where(eq(plans.id, id))
        .run()
      return true
    },
    remove(id, outcome = null) {
      return store.finish(id, 'executed', outcome ?? null)
    },
    setStoredPath(id, storedPath) {
      db.update(plans).set({ storedPath }).where(eq(plans.id, id)).run()
    },
    prune(options) {
      const now = options?.now ?? Date.now()
      const staleMs = options?.staleMs ?? STALE_MS
      const alive = options?.isAlive ?? isPidAlive
      const removed: string[] = []
      for (const record of store.list()) {
        const stale = now - record.heartbeatAt > staleMs
        if (stale || !alive(record.pid)) {
          store.finish(record.id, 'interrupted')
          removed.push(record.id)
        }
      }
      return removed
    },
    dashboard(period, now) {
      return buildDashboard(store.listPlans(), period, now)
    },
    close() {
      if (closed) return
      closed = true
      sqlite.close()
    },
  }

  return store
}
