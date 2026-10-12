import { randomBytes } from 'node:crypto'
import { Elysia } from 'elysia'
import { HttpError } from './http.js'
import { bindElysia } from './httpServer.js'
import { registerPlanRoutes } from './planRoutes.js'
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

  async function processList(): Promise<{
    status: 'disabled' | 'offline' | 'ok'
    selfId: string | null
    registryUrl: string | null
    processes: unknown[]
  }> {
    if (!options.registry) {
      return { status: 'disabled', selfId: null, registryUrl: null, processes: [] }
    }
    try {
      const response = await fetch(new URL('/api/processes', options.registry.url), {
        signal: AbortSignal.timeout(1_500),
      })
      if (!response.ok) {
        return {
          status: 'offline',
          selfId: options.registry.selfId,
          registryUrl: options.registry.url,
          processes: [],
        }
      }
      const payload = (await response.json()) as { processes?: unknown }
      return {
        status: 'ok',
        selfId: options.registry.selfId,
        registryUrl: options.registry.url,
        processes: Array.isArray(payload.processes) ? payload.processes : [],
      }
    } catch {
      return {
        status: 'offline',
        selfId: options.registry.selfId,
        registryUrl: options.registry.url,
        processes: [],
      }
    }
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
      .get('/api/processes', () => processList()),
    {
      hosted: false,
      resolve: () => session,
    },
  )

  const bound = bindElysia(app, host, options.port ?? 0)
  const url = `http://${host}:${bound.port}`

  return {
    port: bound.port,
    url,
    async close() {
      await session.close()
      await bound.stop()
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
