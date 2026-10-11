import { randomBytes, timingSafeEqual } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { Elysia } from 'elysia'
import { parsePeriod } from './dashboard.js'
import { renderDashboardPage } from './dashboardPage.js'
import { bindElysia } from './httpServer.js'
import { archivePlanFile, isPathInside } from './planArchive.js'
import type { CompletionState, GitSnapshot, PlanRecord, ProcessRecord, ReviewOutcome } from './processRecord.js'
import { emptyGitSnapshot } from './processRecord.js'
import { DEFAULT_REGISTRY_HOST, STALE_MS } from './registryConstants.js'
import { registryDatabasePath, registryPlansDir, registryStartingPath, writeRegistryLock } from './registryLock.js'
import { renderRegistryPage } from './registryPage.js'
import { openRegistryStore, type RegistryStore } from './registryStore.js'

export type RegistryServer = {
  url: string
  port: number
  host: string
  token: string
  home: string
  close: () => Promise<void>
}

const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/

type IncomingPlan = ProcessRecord & {
  phaseTotal?: number
  phaseDone?: number
  interactionTotal?: number
  interactionDone?: number
  completionRatio?: number
  completionState?: CompletionState
  filesModified?: number
}

function authorized(request: Request, token: string): boolean {
  const header = request.headers.get('authorization')
  if (!header) return false
  const expected = Buffer.from(`Bearer ${token}`)
  const actual = Buffer.from(header)
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

function clip(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

function requireText(value: unknown, max: number): string | null {
  return clip(value, max)
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if ((url.pathname === '/' || url.pathname === '') && !url.search && !url.hash) return url.origin
    return url.toString()
  } catch {
    return null
  }
}

function countOf(value: unknown): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(0, Math.round(parsed))
}

function completionStateOf(value: unknown): CompletionState | undefined {
  if (value === 'idle' || value === 'in_progress' || value === 'partial' || value === 'complete') return value
  return undefined
}

function outcomeOf(value: unknown): ReviewOutcome | null {
  if (value === 'approve' || value === 'deny' || value === 'iterate') return value
  return null
}

function progressFields(raw: Record<string, unknown>): Pick<
  IncomingPlan,
  | 'phaseTotal'
  | 'phaseDone'
  | 'interactionTotal'
  | 'interactionDone'
  | 'completionRatio'
  | 'completionState'
  | 'filesModified'
> {
  const progress: ReturnType<typeof progressFields> = {}
  const phaseTotal = countOf(raw.phaseTotal)
  const phaseDone = countOf(raw.phaseDone)
  const interactionTotal = countOf(raw.interactionTotal)
  const interactionDone = countOf(raw.interactionDone)
  const completionRatio = countOf(raw.completionRatio)
  const completionState = completionStateOf(raw.completionState)
  const filesModified = countOf(raw.filesModified)
  if (phaseTotal !== undefined) progress.phaseTotal = phaseTotal
  if (phaseDone !== undefined) progress.phaseDone = phaseDone
  if (interactionTotal !== undefined) progress.interactionTotal = interactionTotal
  if (interactionDone !== undefined) progress.interactionDone = interactionDone
  if (completionRatio !== undefined) progress.completionRatio = Math.min(100, completionRatio)
  if (completionState) progress.completionState = completionState
  if (filesModified !== undefined) progress.filesModified = filesModified
  return progress
}

function parseGit(value: unknown): GitSnapshot {
  if (!value || typeof value !== 'object') return emptyGitSnapshot()
  const git = value as Partial<GitSnapshot>
  const changedPaths = Array.isArray(git.changedPaths)
    ? git.changedPaths
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.slice(0, 300))
        .slice(0, 12)
    : []
  const snapshot: GitSnapshot = {
    isRepo: Boolean(git.isRepo),
    root: clip(git.root, 500),
    branch: clip(git.branch, 200),
    commit: clip(git.commit, 80),
    dirty: Boolean(git.dirty),
    ahead: Number.isFinite(Number(git.ahead)) ? Math.max(0, Math.round(Number(git.ahead))) : 0,
    behind: Number.isFinite(Number(git.behind)) ? Math.max(0, Math.round(Number(git.behind))) : 0,
    changedFiles: Number.isFinite(Number(git.changedFiles))
      ? Math.max(0, Math.round(Number(git.changedFiles)))
      : changedPaths.length,
    changedPaths,
    summary: clip(git.summary, 400) ?? '',
  }
  if (!snapshot.isRepo) return emptyGitSnapshot(snapshot.summary || 'not a git repository')
  return snapshot
}

function parseRegistration(body: unknown, now: number): IncomingPlan | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Expected a JSON object' }
  const raw = body as Record<string, unknown>
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!ID_PATTERN.test(id)) return { error: 'Invalid process id' }
  const pid = Number(raw.pid)
  if (!Number.isInteger(pid) || pid <= 0) return { error: 'Invalid pid' }
  const port = Number(raw.port)
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) return { error: 'Invalid port' }
  const mode = raw.mode === 'review' ? 'review' : raw.mode === 'watch' ? 'watch' : null
  if (!mode) return { error: 'Invalid mode' }
  const title = requireText(raw.title, 200)
  const planPath = requireText(raw.planPath, 1000)
  const directory = requireText(raw.directory, 1000)
  const cwd = requireText(raw.cwd, 1000)
  const url = httpUrl(raw.url)
  const host = requireText(raw.host, 255)
  if (!title || !planPath || !directory || !cwd || !url || !host) {
    return { error: 'title, planPath, directory, cwd, url, and host are required' }
  }
  const pendingCount = Number(raw.pendingCount)
  return {
    id,
    pid,
    title,
    summary: clip(raw.summary, 500),
    agent: clip(raw.agent, 200),
    mode,
    planPath,
    directory,
    cwd,
    url,
    host,
    port,
    startedAt: now,
    heartbeatAt: now,
    pendingCount: Number.isFinite(pendingCount) ? Math.max(0, Math.round(pendingCount)) : 0,
    executionActive: Boolean(raw.executionActive),
    executionStep: clip(raw.executionStep, 200),
    git: parseGit(raw.git),
    ...progressFields(raw),
  }
}

function parsePulse(body: unknown): {
  title?: string
  summary?: string | null
  agent?: string | null
  pendingCount?: number
  executionActive?: boolean
  executionStep?: string | null
  git?: GitSnapshot
  phaseTotal?: number
  phaseDone?: number
  interactionTotal?: number
  interactionDone?: number
  completionRatio?: number
  completionState?: CompletionState
  filesModified?: number
} {
  if (!body || typeof body !== 'object') return {}
  const raw = body as Record<string, unknown>
  const pulse: ReturnType<typeof parsePulse> = {}
  const title = clip(raw.title, 200)
  if (title) pulse.title = title
  if ('summary' in raw) pulse.summary = clip(raw.summary, 500)
  if ('agent' in raw) pulse.agent = clip(raw.agent, 200)
  if ('pendingCount' in raw && Number.isFinite(Number(raw.pendingCount))) {
    pulse.pendingCount = Math.max(0, Math.round(Number(raw.pendingCount)))
  }
  if ('executionActive' in raw) pulse.executionActive = Boolean(raw.executionActive)
  if ('executionStep' in raw) pulse.executionStep = clip(raw.executionStep, 200)
  if ('git' in raw) pulse.git = parseGit(raw.git)
  return { ...pulse, ...progressFields(raw) }
}

export function processIdFromPath(pathname: string): string | null {
  const prefix = '/api/processes/'
  if (!pathname.startsWith(prefix)) return null
  const rest = pathname.slice(prefix.length).replace(/\/heartbeat$/, '')
  try {
    const id = decodeURIComponent(rest)
    return ID_PATTERN.test(id) ? id : null
  } catch {
    return null
  }
}

function routeId(value: string): string | null {
  try {
    const id = decodeURIComponent(value)
    return ID_PATTERN.test(id) ? id : null
  } catch {
    return null
  }
}

async function readLimited(request: Request, limit = 65_536): Promise<string> {
  const raw = await request.text()
  if (Buffer.byteLength(raw) > limit) throw new Error('Body too large')
  return raw
}

function html(body: string): Response {
  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

export async function startRegistryServer(options: {
  home: string
  host?: string
  port?: number
  token?: string
  staleMs?: number
}): Promise<RegistryServer> {
  const host = options.host ?? DEFAULT_REGISTRY_HOST
  const token = options.token ?? randomBytes(24).toString('hex')
  const staleMs = options.staleMs ?? STALE_MS
  const plansDir = registryPlansDir(options.home)
  const store: RegistryStore = await openRegistryStore(registryDatabasePath(options.home))
  const page = renderRegistryPage()
  const dashboard = renderDashboardPage()

  for (const plan of store.list()) {
    if (plan.storedPath) continue
    const stored = await archivePlanFile(plansDir, plan.id, plan.planPath)
    if (stored) store.setStoredPath(plan.id, stored)
  }

  async function remember(record: IncomingPlan): Promise<PlanRecord | undefined> {
    const existing = store.get(record.id)
    store.upsert({
      ...record,
      startedAt: existing?.startedAt ?? record.startedAt,
      status: 'running',
      endedAt: null,
      storedPath: existing?.storedPath ?? null,
    })
    const stored = await archivePlanFile(plansDir, record.id, record.planPath)
    if (stored) store.setStoredPath(record.id, stored)
    return store.get(record.id)
  }

  const app = new Elysia()
    .onBeforeHandle(({ set }) => {
      set.headers['cache-control'] = 'no-store'
    })
    .onError(({ code, error, set }) => {
      if (code === 'NOT_FOUND') {
        set.status = 404
        return { error: 'Not found' }
      }
      set.status = 500
      return { error: error instanceof Error ? error.message : 'Unknown error' }
    })
    .get('/api/health', () => ({
      ok: true,
      pid: process.pid,
      processes: store.list().length,
      plans: store.listPlans().length,
    }))
    .get('/', () => html(page))
    .get('/dashboard', () => html(dashboard))
    .get('/api/processes', () => {
      store.prune({ staleMs })
      return { processes: store.list() }
    })
    .get('/api/plans', () => {
      store.prune({ staleMs })
      return { plans: store.listPlans() }
    })
    .get('/api/dashboard', ({ request, set }) => {
      const period = parsePeriod(new URL(request.url).searchParams.get('period') ?? 'day')
      if (!period) {
        set.status = 400
        return { error: 'period must be day, week, or month' }
      }
      store.prune({ staleMs })
      return store.dashboard(period)
    })
    .get('/plans/:id', async ({ params, set }) => {
      const id = routeId(params.id)
      const plan = id ? store.get(id) : undefined
      if (!id || !plan?.storedPath || !isPathInside(plansDir, plan.storedPath)) {
        set.status = 404
        return { error: 'Archived plan not found' }
      }
      const file = Bun.file(plan.storedPath)
      if (!(await file.exists())) {
        set.status = 404
        return { error: 'Archived plan not found' }
      }
      return new Response(file, {
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'cache-control': 'no-store',
          'content-disposition': `inline; filename="${id}.plan.md"`,
        },
      })
    })
    .post('/api/processes', async ({ request, set }) => {
      if (!authorized(request, token)) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const parsed = parseRegistration(JSON.parse(await readLimited(request)) as unknown, Date.now())
      if ('error' in parsed) {
        set.status = 400
        return parsed
      }
      const saved = await remember(parsed)
      return { ok: true, process: saved }
    })
    .post('/api/processes/:id/heartbeat', async ({ params, request, set }) => {
      if (!authorized(request, token)) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const id = routeId(params.id)
      if (!id) {
        set.status = 404
        return { error: 'Not registered' }
      }
      const raw = await readLimited(request)
      const updated = store.heartbeat(id, {
        at: Date.now(),
        ...parsePulse(raw ? (JSON.parse(raw) as unknown) : {}),
      })
      if (!updated) {
        set.status = 404
        return { error: 'Not registered' }
      }
      const stored = await archivePlanFile(plansDir, id, updated.planPath)
      if (stored) store.setStoredPath(id, stored)
      return { ok: true, process: store.get(id) }
    })
    .delete('/api/processes/:id', async ({ params, request, set }) => {
      if (!authorized(request, token)) {
        set.status = 401
        return { error: 'Unauthorized' }
      }
      const id = routeId(params.id)
      if (!id) return { ok: true }
      const raw = await readLimited(request)
      let outcome: ReviewOutcome | null = null
      if (raw.trim()) {
        const body = JSON.parse(raw) as { outcome?: unknown }
        outcome = outcomeOf(body.outcome)
      }
      store.remove(id, outcome)
      const stored = store.get(id)
      if (stored) {
        const archived = await archivePlanFile(plansDir, id, stored.planPath)
        if (archived) store.setStoredPath(id, archived)
      }
      return { ok: true }
    })

  let bound: ReturnType<typeof bindElysia>
  try {
    bound = bindElysia(app, host, options.port ?? 0)
  } catch (error) {
    store.close()
    throw error
  }

  const url = `http://${host}:${bound.port}`
  await writeRegistryLock(options.home, {
    pid: process.pid,
    port: bound.port,
    host,
    url,
    token,
    startedAt: Date.now(),
  })
  await rm(registryStartingPath(options.home), { force: true })

  const timer = setInterval(() => {
    try {
      store.prune({ staleMs })
    } catch {
      // A failed prune should not take down the registry.
    }
  }, 5_000)
  timer.unref()

  return {
    url,
    port: bound.port,
    host,
    token,
    home: options.home,
    async close() {
      clearInterval(timer)
      const { readRegistryLock, registryLockPath } = await import('./registryLock.js')
      const lock = await readRegistryLock(options.home)
      if (lock?.pid === process.pid) {
        await rm(registryLockPath(options.home), { force: true })
      }
      store.close()
      await bound.stop()
    },
  }
}
