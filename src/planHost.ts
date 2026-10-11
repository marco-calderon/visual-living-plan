import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { access } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, resolve } from 'node:path'
import { createIdleExecutionState, type ExecutionState } from './execution.js'
import { readGitSnapshot } from './gitStatus.js'
import { openPlanSession, sendClientAsset, type PlanSession, type PlanSessionSnapshot } from './planSession.js'
import type { GitSnapshot, ProcessRecord } from './processRecord.js'
import { SESSION_IDLE_MS } from './registryConstants.js'
import type { RegistryStore, StoredPlanSession } from './registryStore.js'
import type { InteractionResponse, ReviewResult } from './types.js'

const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/
const GIT_CACHE_MS = 10_000

export type HostedPlan = {
  id: string
  url: string
  token: string
  planPath: string
  mode: 'watch' | 'review'
}

export type PlanHost = {
  register(input: {
    planPath: string
    mode: 'watch' | 'review'
    iteration?: number
    cwd?: string
    configPath?: string
  }): Promise<HostedPlan>
  closePlan(id: string): Promise<boolean>
  listRecords(): ProcessRecord[]
  handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean>
  serveClient(res: ServerResponse, pathname: string): Promise<boolean>
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

function bearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization
  if (typeof header !== 'string') return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match?.[1] ?? null
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
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
    startedAt: snapshot.startedAt,
    lastSeenAt: snapshot.lastSeenAt,
  }
}

export async function createPlanHost(options: {
  store: RegistryStore
  serviceToken: string
  getOrigin: () => string
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
    options.store.saveSession(toStored(snapshot))
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

  function authorized(req: IncomingMessage, session: PlanSession): boolean {
    const presented = bearer(req)
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
    mode: 'watch' | 'review'
    iteration?: number
    cwd?: string
    configPath?: string
  }): Promise<HostedPlan> {
    const planPath = resolve(input.planPath)
    await access(planPath)
    const existing = [...sessions.values()].find((session) => session.planPath === planPath)
    if (existing) {
      existing.setMode(input.mode, input.iteration)
      existing.touch()
      return {
        id: existing.id,
        url: planUrl(existing.id),
        token: existing.token,
        planPath,
        mode: input.mode,
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

  async function closePlan(id: string): Promise<boolean> {
    const session = sessions.get(id)
    if (!session) {
      return options.store.deleteSession(id)
    }
    sessions.delete(id)
    await session.close()
    options.store.deleteSession(id)
    return true
  }

  const idleTimer = setInterval(() => {
    const now = Date.now()
    for (const session of sessions.values()) {
      if (session.browserClients > 0 || session.agentClients > 0) continue
      if (now - session.lastSeenAt < SESSION_IDLE_MS) continue
      void closePlan(session.id)
    }
  }, 60_000)
  idleTimer.unref()

  return {
    register,
    closePlan,
    listRecords() {
      return [...sessions.values()].map((session) => toRecord(session))
    },
    serveClient(res, pathname) {
      return sendClientAsset(res, pathname)
    },
    async handle(req, res, url) {
      const pathname = url.pathname
      const match = pathname.match(/^\/plans\/([A-Za-z0-9_-]+)(\/.*)?$/)
      if (!match) return false
      const id = match[1] ?? ''
      if (!ID_PATTERN.test(id)) {
        sendJson(res, 404, { error: 'Not found' })
        return true
      }
      if (!match[2]) {
        res.writeHead(302, { location: `/plans/${id}/` })
        res.end()
        return true
      }
      const session = sessions.get(id)
      if (!session) {
        sendJson(res, 404, { error: 'Plan not found' })
        return true
      }
      const rest = match[2] === '/' ? '/' : match[2]
      if (req.method === 'GET' && rest === '/api/agent-events') {
        if (!authorized(req, session)) {
          sendJson(res, 401, { error: 'Unauthorized' })
          return true
        }
        session.serveAgentEvents(req, res)
        return true
      }
      await session.handle(req, res, rest)
      return true
    },
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
