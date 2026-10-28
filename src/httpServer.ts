import { runWithPeer } from './lanAccess'

export type FetchApp = {
  fetch: (request: Request) => Response | Promise<Response>
}

type RequestIp = {
  requestIP?: (request: Request) => { address?: string } | null
}

export type BoundServer = {
  port: number
  stop: () => Promise<void>
}

/**
 * Bun serves the Elysia app directly so the process does not depend on Node's HTTP server.
 * `idleTimeout: 0` keeps server-sent events open.
 */
export function bindElysiaAt(app: FetchApp, host: string, port: number): BoundServer {
  const server = Bun.serve({
    port,
    hostname: host,
    idleTimeout: 0,
    fetch: (request, server: RequestIp) => {
      const peer = server.requestIP?.(request)?.address ?? ''
      return runWithPeer(peer, () => app.fetch(request))
    },
  })
  const bound = server.port
  if (!bound) {
    void server.stop(true)
    throw new Error('Unable to bind server')
  }
  return {
    port: bound,
    async stop() {
      await server.stop(true)
    },
  }
}

export function bindElysia(app: FetchApp, host: string, preferredPort: number): BoundServer {
  const candidates = preferredPort > 0 ? [preferredPort, 0] : [0]
  let lastError: unknown
  for (const port of candidates) {
    try {
      return bindElysiaAt(app, host, port)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unable to bind server')
}
