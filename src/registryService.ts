import { randomBytes, timingSafeEqual } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createPlanHost, type PlanHost } from './planHost.js'
import { DEFAULT_REGISTRY_HOST, STALE_MS } from './registryConstants.js'
import { registryDatabasePath, registryStartingPath, writeRegistryLock } from './registryLock.js'
import { renderRegistryPage } from './registryPage.js'
import { openRegistryStore, type RegistryStore } from './registryStore.js'
import type { GitSnapshot, ProcessRecord } from './processRecord.js'
import { emptyGitSnapshot } from './processRecord.js'

export type RegistryServer = {
  url: string
  port: number
  host: string
  token: string
  home: string
  close: () => Promise<void>
}

const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage, limit = 65_536): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.from(chunk)
      size += buffer.length
      if (size > limit) {
        reject(new Error('Body too large'))
        req.destroy()
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function authorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization
  if (typeof header !== 'string') return false
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

export function planIdFromPath(pathname: string): string | null {
  const prefix = '/api/plans/'
  if (!pathname.startsWith(prefix)) return null
  try {
    const id = decodeURIComponent(pathname.slice(prefix.length))
    return ID_PATTERN.test(id) ? id : null
  } catch {
    return null
  }
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

export async function startRegistryServer(options: {
  home: string
  host?: string
  port?: number
  token?: string
  staleMs?: number
  version?: string
}): Promise<RegistryServer> {
  const host = options.host ?? DEFAULT_REGISTRY_HOST
  const token = options.token ?? randomBytes(24).toString('hex')
  const staleMs = options.staleMs ?? STALE_MS
  const store: RegistryStore = await openRegistryStore(registryDatabasePath(options.home))
  const page = renderRegistryPage()
  const originBox = { current: '' }
  const planHost: PlanHost = await createPlanHost({
    store,
    serviceToken: token,
    getOrigin: () => originBox.current,
  })

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${host}`)
    try {
      if (req.method === 'GET' && url.pathname === '/api/health') {
        sendJson(res, 200, {
          ok: true,
          pid: process.pid,
          processes: store.list().length + planHost.listRecords().length,
          version: options.version ?? null,
        })
        return
      }

      if (req.method === 'GET' && url.pathname.startsWith('/client/')) {
        const served = await planHost.serveClient(res, url.pathname)
        if (!served && !res.headersSent) sendJson(res, 404, { error: 'Asset not found' })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/plans') {
        if (!authorized(req, token)) {
          sendJson(res, 401, { error: 'Unauthorized' })
          return
        }
        const body = JSON.parse(await readBody(req)) as Record<string, unknown>
        const planPath = requireText(body.planPath, 1000)
        const mode = body.mode === 'review' ? 'review' : body.mode === 'watch' ? 'watch' : null
        if (!planPath || !mode) {
          sendJson(res, 400, { error: 'planPath and mode are required' })
          return
        }
        const iteration = Number(body.iteration)
        try {
          const hosted = await planHost.register({
            planPath,
            mode,
            iteration: Number.isFinite(iteration) ? iteration : undefined,
            cwd: requireText(body.cwd, 1000) ?? undefined,
            configPath: requireText(body.configPath, 1000) ?? undefined,
          })
          sendJson(res, 200, { ok: true, plan: hosted })
        } catch (error) {
          const code = error && typeof error === 'object' && 'code' in error ? error.code : ''
          sendJson(res, code === 'ENOENT' ? 404 : 400, {
            error: error instanceof Error ? error.message : 'Unable to open plan',
          })
        }
        return
      }

      const hostedId = planIdFromPath(url.pathname)
      if (hostedId && req.method === 'DELETE' && url.pathname === `/api/plans/${encodeURIComponent(hostedId)}`) {
        if (!authorized(req, token)) {
          sendJson(res, 401, { error: 'Unauthorized' })
          return
        }
        const removed = await planHost.closePlan(hostedId)
        sendJson(res, removed ? 200 : 404, removed ? { ok: true } : { error: 'Not found' })
        return
      }

      if (await planHost.handle(req, res, url)) return

      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(page)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/processes') {
        store.prune({ staleMs })
        sendJson(res, 200, {
          status: 'ok',
          processes: [...planHost.listRecords(), ...store.list()],
        })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/processes') {
        if (!authorized(req, token)) {
          sendJson(res, 401, { error: 'Unauthorized' })
          return
        }
        const parsed = parseRegistration(JSON.parse(await readBody(req)) as unknown, Date.now())
        if ('error' in parsed) {
          sendJson(res, 400, parsed)
          return
        }
        const existing = store.get(parsed.id)
        store.upsert(existing ? { ...parsed, startedAt: existing.startedAt } : parsed)
        sendJson(res, 200, { ok: true, process: store.get(parsed.id) })
        return
      }

      const id = processIdFromPath(url.pathname)
      if (id && req.method === 'POST' && url.pathname.endsWith('/heartbeat')) {
        if (!authorized(req, token)) {
          sendJson(res, 401, { error: 'Unauthorized' })
          return
        }
        const raw = await readBody(req)
        const updated = store.heartbeat(id, {
          at: Date.now(),
          ...parsePulse(raw ? (JSON.parse(raw) as unknown) : {}),
        })
        if (!updated) {
          sendJson(res, 404, { error: 'Not registered' })
          return
        }
        sendJson(res, 200, { ok: true, process: updated })
        return
      }

      if (id && req.method === 'DELETE' && url.pathname === `/api/processes/${encodeURIComponent(id)}`) {
        if (!authorized(req, token)) {
          sendJson(res, 401, { error: 'Unauthorized' })
          return
        }
        store.remove(id)
        sendJson(res, 200, { ok: true })
        return
      }

      sendJson(res, 404, { error: 'Not found' })
    } catch (error) {
      if (res.headersSent) return
      sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unknown error' })
    }
  })

  const preferred = options.port ?? 0
  const candidates = preferred > 0 ? [preferred, 0] : [0]
  let lastError: unknown
  let port = 0
  for (const candidate of candidates) {
    try {
      port = await new Promise<number>((resolvePort, reject) => {
        const onError = (error: Error) => {
          server.off('listening', onListening)
          reject(error)
        }
        const onListening = () => {
          server.off('error', onError)
          const address = server.address()
          if (!address || typeof address === 'string') {
            reject(new Error('Unable to bind living-plan registry'))
            return
          }
          resolvePort(address.port)
        }
        server.once('error', onError)
        server.listen(candidate, host, onListening)
      })
      lastError = undefined
      break
    } catch (error) {
      lastError = error
    }
  }
  if (!port) {
    store.close()
    throw lastError instanceof Error ? lastError : new Error('Unable to bind living-plan registry')
  }

  const url = `http://${host}:${port}`
  originBox.current = url
  await writeRegistryLock(options.home, {
    pid: process.pid,
    port,
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
    port,
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
      await planHost.close()
      store.close()
      server.closeAllConnections()
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()))
      })
    },
  }
}
