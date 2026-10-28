import { SpikeError } from './errors'
import { createHub, formatSse, type Hub } from './hub'
import { defaultDbPath, openSpikeDb, type SpikeDb } from './db'

export type StartServerOptions = {
  port?: number
  hostname?: string
  dbPath?: string
  /** Insert the sample plan when the database has no documents. Defaults to true. */
  seed?: boolean
}

export type SpikeServer = {
  port: number
  url: string
  stop: () => Promise<void>
}

const pingMs = 15_000

export function startServer(options: StartServerOptions = {}): SpikeServer {
  const dbPath = options.dbPath ?? defaultDbPath()
  const db = openSpikeDb(dbPath, options.seed !== false)
  const hub = createHub()
  const server = Bun.serve({
    hostname: options.hostname ?? '127.0.0.1',
    port: options.port ?? 9488,
    // Bun's default idle timeout closes server-sent events after a few seconds.
    idleTimeout: 0,
    fetch: (request) => handle(request, db, hub),
  })
  const port = server.port
  if (!port) {
    hub.close()
    db.close()
    throw new Error('Unable to bind the spike server')
  }
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    async stop() {
      hub.close()
      await server.stop(true)
      db.close()
    },
  }
}

async function handle(request: Request, db: SpikeDb, hub: Hub): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() })
  try {
    if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true })
    if (url.pathname === '/events' && request.method === 'GET') return eventStream(request, db, hub)
    if (url.pathname === '/events' && request.method === 'POST') return json(await postEvent(request, db, hub))
    if (url.pathname === '/api/plans' && request.method === 'GET') return json({ plans: db.listDocuments() })
    const snapshotsId = planIdFrom(url.pathname, '/snapshots')
    if (snapshotsId && request.method === 'GET') {
      const plan = db.getDocument(snapshotsId)
      if (!plan) return json({ message: 'Plan not found' }, 404)
      return json({ snapshots: db.listSnapshots(snapshotsId) })
    }
    const planId = planIdFrom(url.pathname, '')
    if (planId && request.method === 'GET') {
      const plan = db.getDocument(planId)
      if (!plan) return json({ message: 'Plan not found' }, 404)
      return json({ plan, snapshots: db.listSnapshots(planId) })
    }
    return json({ message: 'Not found' }, 404)
  } catch (error) {
    if (error instanceof SpikeError) return json({ message: error.message }, error.status)
    const message = error instanceof Error ? error.message : 'Server error'
    return json({ message }, 500)
  }
}

async function postEvent(request: Request, db: SpikeDb, hub: Hub) {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) throw new SpikeError(415, 'Content-Type must be application/json')
  const text = await request.text()
  if (text.length > maxRequestLength) throw new SpikeError(413, 'Body is too large')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new SpikeError(400, 'Invalid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new SpikeError(400, 'Expected { event, data }')
  }
  const record = parsed as Record<string, unknown>
  if (typeof record.event !== 'string') throw new SpikeError(400, 'Expected { event, data }')
  const result = db.apply(record.event, record.data)
  if (result.changed && result.snapshot) {
    const applied = { plan: result.plan, snapshot: result.snapshot }
    hub.publish(record.event, applied)
    hub.publish('snapshot', { snapshot: result.snapshot })
    hub.publish('plan', { plan: result.plan })
  }
  return {
    ok: true as const,
    changed: result.changed,
    plan: result.plan,
    snapshot: result.snapshot,
  }
}

function eventStream(request: Request, db: SpikeDb, hub: Hub): Response {
  const encoder = new TextEncoder()
  let unsubscribe = () => {}
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true
      const ping = setInterval(() => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(': ping\n\n'))
        } catch {
          unsubscribe()
        }
      }, pingMs)
      ping.unref?.()
      const send = (frame: string) => {
        if (!open) return
        controller.enqueue(encoder.encode(frame))
      }
      const close = () => {
        if (!open) return
        open = false
        clearInterval(ping)
        drop()
        try {
          controller.close()
        } catch {
          // The client already went away.
        }
      }
      const drop = hub.subscribe(send, close)
      unsubscribe = close
      // Resync the whole store on every connection, including reconnects.
      send(formatSse('hello', db.hello(), 0))
      request.signal.addEventListener('abort', close, { once: true })
      if (request.signal.aborted) close()
    },
    cancel() {
      unsubscribe()
    },
  })
  return new Response(stream, {
    headers: corsHeaders({
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    }),
  })
}

const maxRequestLength = 1_000_000

function planIdFrom(pathname: string, suffix: string): string | null {
  const prefix = '/api/plans/'
  if (!pathname.startsWith(prefix)) return null
  let rest = pathname.slice(prefix.length)
  if (suffix) {
    if (!rest.endsWith(suffix)) return null
    rest = rest.slice(0, -suffix.length)
  }
  if (!rest || rest.includes('/')) return null
  try {
    return decodeURIComponent(rest)
  } catch {
    return null
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    }),
  })
}

function corsHeaders(extra?: Record<string, string>): Headers {
  const headers = new Headers(extra)
  headers.set('access-control-allow-origin', '*')
  headers.set('access-control-allow-methods', 'GET, POST, OPTIONS')
  headers.set('access-control-allow-headers', 'content-type, accept')
  return headers
}

if (import.meta.main) {
  const port = Number(process.env.MDX_SPIKE_PORT ?? 9488)
  if (!Number.isInteger(port) || port < 0) throw new Error('MDX_SPIKE_PORT must be an integer')
  const dbPath = process.env.MDX_SPIKE_DB ?? defaultDbPath()
  const running = startServer({ port, dbPath })
  console.log({ port: running.port, dbPath })
}
