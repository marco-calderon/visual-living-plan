import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { openPlanSession, type PlanSession } from './planSession.js'
import type { InteractionResponse, ReviewResult } from './types.js'

export type LivingPlanServer = {
  port: number
  url: string
  close: () => Promise<void>
  waitForInteraction: (id: string, timeoutMs?: number) => Promise<InteractionResponse>
  waitForReview: (timeoutMs?: number) => Promise<ReviewResult>
  getState: () => ReturnType<PlanSession['getState']>
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

export async function startLivingPlanServer(options: {
  planPath: string
  mode: 'watch' | 'review'
  port?: number
  iteration?: number
  host?: string
  /** Shared registry this page proxies so the plans panel stays same-origin. */
  registry?: {
    url: string
    selfId: string
  }
  configPath?: string
}): Promise<LivingPlanServer> {
  const host = options.host ?? '127.0.0.1'
  const selfId = options.registry?.selfId ?? randomBytes(16).toString('hex')
  const session = await openPlanSession({
    id: selfId,
    token: randomBytes(24).toString('hex'),
    planPath: options.planPath,
    mode: options.mode,
    iteration: options.iteration,
    configPath: options.configPath,
    cwd: process.cwd(),
    basePath: '',
    selfId,
  })

  async function sendProcessList(res: ServerResponse): Promise<void> {
    if (!options.registry) {
      sendJson(res, 200, {
        status: 'disabled',
        selfId: null,
        registryUrl: null,
        processes: [],
      })
      return
    }
    try {
      const response = await fetch(new URL('/api/processes', options.registry.url), {
        signal: AbortSignal.timeout(1_500),
      })
      if (!response.ok) {
        sendJson(res, 200, {
          status: 'offline',
          selfId: options.registry.selfId,
          registryUrl: options.registry.url,
          processes: [],
        })
        return
      }
      const payload = (await response.json()) as { processes?: unknown }
      sendJson(res, 200, {
        status: 'ok',
        selfId: options.registry.selfId,
        registryUrl: options.registry.url,
        processes: Array.isArray(payload.processes) ? payload.processes : [],
      })
    } catch {
      sendJson(res, 200, {
        status: 'offline',
        selfId: options.registry.selfId,
        registryUrl: options.registry.url,
        processes: [],
      })
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${host}`)
    try {
      if (req.method === 'GET' && url.pathname === '/api/processes') {
        await sendProcessList(res)
        return
      }
      await session.handle(req, res, url.pathname)
    } catch (error) {
      if (res.headersSent) return
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  const port = await new Promise<number>((resolvePort, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, host, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to bind living-plan server'))
        return
      }
      resolvePort(address.port)
    })
  })

  const url = `http://${host}:${port}`

  return {
    port,
    url,
    async close() {
      await session.close()
      server.closeAllConnections()
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()))
      })
    },
    waitForInteraction(id, timeoutMs) {
      return session.waitForInteraction(id, timeoutMs)
    },
    waitForReview(timeoutMs) {
      return session.waitForReview(timeoutMs)
    },
    getState() {
      return session.getState()
    },
  }
}
