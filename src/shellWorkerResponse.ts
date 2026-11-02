import { readFileSync } from 'node:fs'

export const SHELL_WORKER_PATH = '/sw.js'

export function shellWorkerResponse(source: string): Response {
  return new Response(source, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-cache',
      'service-worker-allowed': '/',
    },
  })
}

/** The built worker next to this module. `src/` in dev, `dist/` after `npm run build`. */
export function readShellWorkerSource(): string {
  return readFileSync(new URL('./shellWorker.js', import.meta.url), 'utf8')
}
