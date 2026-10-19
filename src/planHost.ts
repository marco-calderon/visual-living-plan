import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createIdleExecutionState, type ExecutionState } from './execution'
import { readGitSnapshot } from './gitStatus'
import { openPlanSession, type PlanSession, type PlanSessionSnapshot } from './planSession'
import { measurePlan } from './planProgress'
import type { GitSnapshot, PlanMode, PlanRecord, ProcessRecord, ReviewOutcome } from './processRecord'
import { runningPlan } from './processRecord'
import { SESSION_IDLE_MS } from './registryConstants'
import type { RegistryStore, StoredPlanSession } from './registryStore'
import type { InteractionResponse, PlanComment, ReviewResult } from './types'

const GIT_CACHE_MS = 10_000

export type HostedPlan = {
  id: string
  url: string
  token: string
  planPath: string
  mode: PlanMode
}

export type PlanHost = {
  register(input: {
    planPath: string
    mode: PlanMode
    iteration?: number
    cwd?: string
    configPath?: string
  }): Promise<HostedPlan>
  closePlan(id: string, status?: 'executed' | 'interrupted'): Promise<boolean>
  listRecords(): ProcessRecord[]
  dashboardRecords(): PlanRecord[]
  getSession(id: string): PlanSession | undefined
  authorize(request: Request, session: PlanSession): boolean
  close(): Promise<void>
}

function planIdForPath(planPath: string): string {
  return createHash('sha256').update(resolve(planPath)).digest('hex').slice(0, 24)
}

function tokenEquals(expected: string, actual: string): boolean {
  const left = Buffer.from(expected)
  const right = Buffer.from(actual)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header) return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match?.[1] ?? null
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function toStored(snapshot: PlanSessionSnapshot): StoredPlanSession {
  return {
    id: snapshot.id,
    token: snapshot.token,
    planPath: snapshot.planPath,
    mode: snapshot.mode,
    iteration: snapshot.iteration,
    cwd: snapshot.cwd,
    configPath: snapshot.configPath,
    responsesJson: JSON.stringify(snapshot.responses),
    executionJson: JSON.stringify(snapshot.execution),
    reviewJson: snapshot.review ? JSON.stringify(snapshot.review) : null,
    commentsJson: JSON.stringify(snapshot.comments),
    startedAt: snapshot.startedAt,
    lastSeenAt: snapshot.lastSeenAt,
  }
}

function reviewOutcome(decision: string | undefined): ReviewOutcome | null {
  if (decision === 'approve' || decision === 'deny' || decision === 'iterate') return decision
  return null
}

export async function createPlanHost(options: {
  store: RegistryStore
  serviceToken: string
  getOrigin: () => string
  onFinish?: (record: PlanRecord) => void | Promise<void>
}): Promise<PlanHost> {
  const sessions = new Map<string, PlanSession>()
  const gitCache = new Map<string, { at: number; snapshot: GitSnapshot }>()
  let closed = false

  function origin(): string {
    return options.getOrigin().replace(/\/$/, '')
  }

  function planUrl(id: string): string {
    return `${origin()}/plans/${id}/`
  }

  function cachedGit(directory: string): GitSnapshot {
    const hit = gitCache.get(directory)
    if (hit && Date.now() - hit.at < GIT_CACHE_MS) return hit.snapshot
    const snapshot = readGitSnapshot(directory)
    gitCache.set(directory, { at: Date.now(), snapshot })
    return snapshot
  }

  function persist(snapshot: PlanSessionSnapshot): void {
    if (closed) return
    options.store.saveSession(toStored(snapshot), snapshot.events)
  }

  async function openStored(row: StoredPlanSession): Promise<PlanSession | null> {
    try {
      await access(row.planPath)
    } catch {
      options.store.deleteSession(row.id)
      return null
    }
    const session = await openPlanSession({
      id: row.id,
      token: row.token,
      planPath: row.planPath,
      mode: row.mode,
      iteration: row.iteration,
      cwd: row.cwd,
      configPath: row.configPath ?? undefined,
      basePath: `/plans/${row.id}`,
      selfId: row.id,
      startedAt: row.startedAt,
      lastSeenAt: row.lastSeenAt,
      responses: parseJson<Record<string, InteractionResponse>>(row.responsesJson, {}),
      execution: parseJson<ExecutionState>(row.executionJson, createIdleExecutionState()),
      review: row.reviewJson ? parseJson<ReviewResult | null>(row.reviewJson, null) : null,
      comments: parseJson<PlanComment[]>(row.commentsJson, []),
      events: options.store.listEvents(row.id),
      onChange: persist,
    })
    sessions.set(session.id, session)
    return session
  }

  for (const row of options.store.listSessions()) {
    try {
      await openStored(row)
    } catch {
      options.store.deleteSession(row.id)
    }
  }

  function authorize(request: Request, session: PlanSession): boolean {
    const presented = bearer(request)
    if (!presented) return false
    return tokenEquals(options.serviceToken, presented) || tokenEquals(session.token, presented)
  }

  function toRecord(session: PlanSession): ProcessRecord {
    const state = session.getState()
    const directory = dirname(session.planPath)
    const snapshot = session.snapshot()
    let port = 0
    let host = '127.0.0.1'
    try {
      const url = new URL(origin())
      host = url.hostname
      port = Number(url.port) || (url.protocol === 'https:' ? 443 : 80)
    } catch {
      // Origin is filled in after the socket binds.
    }
    return {
      id: session.id,
      pid: process.pid,
      title: state.plan.title,
      summary: state.plan.summary ?? null,
      agent: state.plan.agent ?? null,
      mode: snapshot.mode,
      planPath: session.planPath,
      directory,
      cwd: snapshot.cwd,
      url: planUrl(session.id),
      host,
      port,
      startedAt: session.startedAt,
      heartbeatAt: session.lastSeenAt,
      pendingCount: state.pendingInteractionIds.length,
      executionActive: Boolean(state.execution.active),
      executionStep: state.execution.step ?? null,
      git: cachedGit(directory),
    }
  }

  async function register(input: {
    planPath: string
    mode: PlanMode
    iteration?: number
    cwd?: string
    configPath?: string
  }): Promise<HostedPlan> {
    const planPath = resolve(input.planPath)
    await access(planPath)
    const existing = [...sessions.values()].find((session) => session.planPath === planPath)
    if (existing) {
      if (input.mode !== 'watch') existing.setMode(input.mode, input.iteration)
      existing.touch()
      return {
        id: existing.id,
        url: planUrl(existing.id),
        token: existing.token,
        planPath,
        mode: existing.mode,
      }
    }
    const stored = options.store.getSessionByPath(planPath)
    const id = stored?.id ?? planIdForPath(planPath)
    const token = stored?.token ?? randomBytes(24).toString('hex')
    const session = await openPlanSession({
      id,
      token,
      planPath,
      mode: input.mode,
      iteration: input.iteration ?? stored?.iteration ?? 1,
      cwd: input.cwd ?? stored?.cwd ?? process.cwd(),
      configPath: input.configPath ?? stored?.configPath ?? undefined,
      basePath: `/plans/${id}`,
      selfId: id,
      startedAt: stored?.startedAt,
      responses: stored ? parseJson(stored.responsesJson, {}) : undefined,
      execution: stored ? parseJson(stored.executionJson, createIdleExecutionState()) : undefined,
      review: stored?.reviewJson ? parseJson(stored.reviewJson, null) : null,
      comments: stored ? parseJson<PlanComment[]>(stored.commentsJson, []) : undefined,
      events: options.store.listEvents(id),
      onChange: persist,
    })
    sessions.set(session.id, session)
    persist(session.snapshot())
    return {
      id: session.id,
      url: planUrl(session.id),
      token: session.token,
      planPath,
      mode: input.mode,
    }
  }

  function dashboardRecord(session: PlanSession, status: 'running' | 'executed' | 'interrupted' = 'running'): PlanRecord {
    const state = session.getState()
    const progress = measurePlan(state.plan, Object.keys(state.responses))
    const now = Date.now()
    const base = runningPlan(toRecord(session), now)
    return {
      ...base,
      ...progress,
      status,
      filesModified: base.git.changedFiles,
      outcome: reviewOutcome(state.review?.decision),
      endedAt: status === 'running' ? null : now,
      durationMs: Math.max(0, (status === 'running' ? now : now) - session.startedAt),
    }
  }

  async function closePlan(id: string, status: 'executed' | 'interrupted' = 'executed'): Promise<boolean> {
    const session = sessions.get(id)
    if (!session) {
      return options.store.deleteSession(id)
    }
    const finished = dashboardRecord(session, status)
    sessions.delete(id)
    await session.close()
    await options.onFinish?.(finished)
    options.store.deleteSession(id)
    return true
  }

  const idleTimer = setInterval(() => {
    const now = Date.now()
    for (const session of sessions.values()) {
      if (session.browserClients > 0 || session.agentClients > 0) continue
      if (now - session.lastSeenAt < SESSION_IDLE_MS) continue
      void closePlan(session.id, 'interrupted')
    }
  }, 60_000)
  idleTimer.unref()

  return {
    register,
    closePlan,
    listRecords() {
      return [...sessions.values()].map((session) => toRecord(session))
    },
    dashboardRecords() {
      return [...sessions.values()].map((session) => dashboardRecord(session))
    },
    getSession(id) {
      return sessions.get(id)
    },
    authorize,
    async close() {
      if (closed) return
      closed = true
      clearInterval(idleTimer)
      const open = [...sessions.values()]
      sessions.clear()
      await Promise.all(open.map((session) => session.close()))
    },
  }
}
