import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { Elysia } from 'elysia'
import { buildDashboard, parsePeriod, periodRange } from './dashboard'
import { renderDashboardPage } from './dashboardPage'
import { assertBodyLimit, html, HttpError, jsonBody } from './http'
import { bindElysia } from './httpServer'
import { archivePlanFile, archivedPlanPath, isPathInside } from './planArchive'
import { createPlanHost, type PlanHost } from './planHost'
import { registerPlanRoutes } from './planRoutes'
import { readClientAsset } from './planSession'
import {
  ensureLocalHostname,
  exposeLoopbackPort80,
  formatHttpOrigin,
  isLoopbackHost,
  servicePublicOrigin,
} from './localName'
import { DEFAULT_REGISTRY_HOST, DEFAULT_REGISTRY_PORT, STALE_MS } from './registryConstants'
import { registryDatabasePath, registryPlansDir, registryStartingPath, writeRegistryLock } from './registryLock'
import { renderRegistryPage } from './registryPage'
import { openRegistryStore, type RegistryStore, type RunWindow } from './registryStore'
import type { GitSnapshot, PlanRecord, ProcessRecord, ReviewOutcome } from './processRecord'
import { emptyGitSnapshot, finishedPlan, runningPlan } from './processRecord'

export type RegistryServer = {
  url: string
  port: number
  host: string
  token: string
  home: string
  close: () => Promise<void>
}

const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/

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

function parseRegistration(body: unknown, now: number): ProcessRecord | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Expected a JSON object' }
  const raw = body as Record<string, unknown>
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (!ID_PATTERN.test(id)) return { error: 'Invalid process id' }
  const pid = Number(raw.pid)
  if (!Number.isInteger(pid) || pid <= 0) return { error: 'Invalid pid' }
  const port = Number(raw.port)
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) return { error: 'Invalid port' }
  const mode = raw.mode === 'review' ? 'review' : raw.mode === 'comment' ? 'comment' : raw.mode === 'watch' ? 'watch' : null
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
  return pulse
}

function routeId(value: string | undefined): string | null {
  if (!value) return null
  try {
    const id = decodeURIComponent(value)
    return ID_PATTERN.test(id) ? id : null
  } catch {
    return null
  }
}

export async function startRegistryServer(options: {
  home: string
  host?: string
  port?: number
  /** Publish http://living-plan.local when this service is bound to loopback. */
  localName?: boolean
  token?: string
  staleMs?: number
  version?: string
}): Promise<RegistryServer> {
  const host = options.host ?? DEFAULT_REGISTRY_HOST
  const token = options.token ?? randomBytes(24).toString('hex')
  const staleMs = options.staleMs ?? STALE_MS
  const store: RegistryStore = await openRegistryStore(registryDatabasePath(options.home))
  const plansDir = registryPlansDir(options.home)
  const page = renderRegistryPage()
  const dashboardPage = renderDashboardPage()
  const originBox = { current: '' }

  async function remember(record: PlanRecord): Promise<void> {
    const stored = await archivePlanFile(plansDir, record.id, record.planPath)
    store.saveRun(stored ? { ...record, storedPath: stored } : record)
  }

  const planHost: PlanHost = await createPlanHost({
    store,
    serviceToken: token,
    getOrigin: () => originBox.current,
    onFinish: remember,
  })

  function dashboardPlans(window?: RunWindow): PlanRecord[] {
    return [
      ...planHost.dashboardRecords(),
      ...store.list().map((record) => runningPlan(record)),
      ...store.listRuns(window),
    ]
  }

  const app = registerPlanRoutes(
    new Elysia({ strictPath: true })
      .onBeforeHandle(({ set }) => {
        set.headers['cache-control'] = 'no-store'
      })
      .onError(({ code, error, set }) => {
        if (error instanceof HttpError) {
          set.status = error.status
          return { error: error.message }
        }
        if (code === 'NOT_FOUND') {
          set.status = 404
          return { error: 'Not found' }
        }
        set.status = 500
        return { error: error instanceof Error ? error.message : 'Unknown error' }
      })
      .get('/dashboard', () => html(dashboardPage))
      .get('/api/dashboard', ({ request, set }) => {
        const period = parsePeriod(new URL(request.url).searchParams.get('period') ?? 'day')
        if (!period) {
          set.status = 400
          return { error: 'period must be day, week, or month' }
        }
        store.prune({ staleMs })
        const now = Date.now()
        const range = periodRange(period, now)
        return buildDashboard(dashboardPlans(range), period, now)
      })
      .get('/api/plans', () => {
        store.prune({ staleMs })
        return { plans: dashboardPlans() }
      })
      .get('/archive/:id', async ({ params, set }) => {
        const id = routeId(params.id)
        const target = id ? archivedPlanPath(plansDir, id) : null
        if (!target || !isPathInside(plansDir, target)) {
          set.status = 404
          return { error: 'Archived plan not found' }
        }
        try {
          const body = await readFile(target)
          return new Response(body, {
            headers: {
              'content-type': 'text/markdown; charset=utf-8',
              'cache-control': 'no-store',
            },
          })
        } catch {
          set.status = 404
          return { error: 'Archived plan not found' }
        }
      })
      .get('/api/health', () => ({
        ok: true,
        pid: process.pid,
        processes: store.list().length + planHost.listRecords().length,
        version: options.version ?? null,
      }))
      .get('/client/*', async ({ params, set }) => {
        try {
          const response = await readClientAsset(String(params['*'] ?? ''))
          if (!response) {
            set.status = 404
            return { error: 'Asset not found' }
          }
          return response
        } catch (error) {
          if (error instanceof HttpError) {
            set.status = error.status
            return { error: error.message }
          }
          throw error
        }
      })
      .post('/api/plans', async ({ request, body, set }) => {
        if (!authorized(request, token)) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        assertBodyLimit(request)
        const payload = jsonBody(body, true) as Record<string, unknown>
        const planPath = requireText(payload.planPath, 1000)
        const mode = payload.mode === 'review' ? 'review' : payload.mode === 'comment' ? 'comment' : payload.mode === 'watch' ? 'watch' : null
        if (!planPath || !mode) {
          set.status = 400
          return { error: 'planPath and mode are required' }
        }
        const iteration = Number(payload.iteration)
        try {
          const hosted = await planHost.register({
            planPath,
            mode,
            iteration: Number.isFinite(iteration) ? iteration : undefined,
            cwd: requireText(payload.cwd, 1000) ?? undefined,
            configPath: requireText(payload.configPath, 1000) ?? undefined,
          })
          return { ok: true, plan: hosted }
        } catch (error) {
          const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
          set.status = code === 'ENOENT' ? 404 : 400
          return { error: error instanceof Error ? error.message : 'Unable to open plan' }
        }
      })
      .delete('/api/plans/:id', async ({ request, params, set }) => {
        if (!authorized(request, token)) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        const id = routeId(params.id)
        if (!id) {
          set.status = 404
          return { error: 'Not found' }
        }
        const removed = await planHost.closePlan(id)
        if (!removed) {
          set.status = 404
          return { error: 'Not found' }
        }
        return { ok: true }
      })
      .get('/', () => html(page))
      .get('/api/processes', () => {
        store.prune({ staleMs })
        return {
          status: 'ok',
          processes: [...planHost.listRecords(), ...store.list()],
        }
      })
      .post('/api/processes', async ({ request, body, set }) => {
        if (!authorized(request, token)) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        assertBodyLimit(request)
        const parsed = parseRegistration(jsonBody(body, true), Date.now())
        if ('error' in parsed) {
          set.status = 400
          return parsed
        }
        const existing = store.get(parsed.id)
        store.upsert(existing ? { ...parsed, startedAt: existing.startedAt } : parsed)
        await archivePlanFile(plansDir, parsed.id, parsed.planPath)
        return { ok: true, process: store.get(parsed.id) }
      })
      .post('/api/processes/:id/heartbeat', ({ request, params, body, set }) => {
        if (!authorized(request, token)) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        assertBodyLimit(request)
        const id = routeId(params.id)
        if (!id) {
          set.status = 404
          return { error: 'Not found' }
        }
        const updated = store.heartbeat(id, {
          at: Date.now(),
          ...parsePulse(jsonBody(body, false)),
        })
        if (!updated) {
          set.status = 404
          return { error: 'Not registered' }
        }
        return { ok: true, process: updated }
      })
      .delete('/api/processes/:id', async ({ request, params, body, set }) => {
        if (!authorized(request, token)) {
          set.status = 401
          return { error: 'Unauthorized' }
        }
        assertBodyLimit(request)
        const id = routeId(params.id)
        if (!id) {
          set.status = 404
          return { error: 'Not found' }
        }
        const existing = store.get(id)
        if (existing) {
          const payload = jsonBody(body, false) as { outcome?: unknown }
          const outcome: ReviewOutcome | null =
            payload.outcome === 'approve' || payload.outcome === 'deny' || payload.outcome === 'iterate'
              ? payload.outcome
              : null
          await remember(finishedPlan(existing, 'executed', outcome))
        }
        store.remove(id)
        return { ok: true }
      }),
    {
      hosted: true,
      resolve: (id) => (id ? planHost.getSession(id) : undefined),
      authorizeAgent: (request, session) => planHost.authorize(request, session),
    },
  )

  let bound: ReturnType<typeof bindElysia>
  try {
    bound = bindElysia(app, host, options.port ?? 0)
  } catch (error) {
    await planHost.close()
    store.close()
    throw error
  }

  let releasePort80: () => Promise<void> = async () => undefined
  let url = formatHttpOrigin(host, bound.port)
  if (options.localName && isLoopbackHost(host)) {
    try {
      const named = await ensureLocalHostname({ elevate: 'passwordless' })
      let portless = bound.port === 80
      if (named.outcome === 'ready' && bound.port === DEFAULT_REGISTRY_PORT) {
        const exposed = await exposeLoopbackPort80({ app, targetPort: bound.port })
        portless = exposed.portless
        releasePort80 = exposed.stop
      }
      url = servicePublicOrigin({
        bindHost: host,
        port: bound.port,
        nameReady: named.outcome === 'ready',
        portless,
      })
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
    }
  }
  originBox.current = url
  await writeRegistryLock(options.home, {
    pid: process.pid,
    port: bound.port,
    host,
    url,
    token,
    startedAt: Date.now(),
    version: options.version,
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
      await releasePort80()
      const { readRegistryLock, registryLockPath } = await import('./registryLock')
      const lock = await readRegistryLock(options.home)
      if (lock?.pid === process.pid) {
        await rm(registryLockPath(options.home), { force: true })
      }
      await planHost.close()
      store.close()
      await bound.stop()
    },
  }
}
