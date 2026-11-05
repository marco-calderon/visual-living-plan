import { spawn, type ChildProcess } from 'node:child_process'
import { test } from '@playwright/test'

/**
 * A plan server of the spec's own, on its own port.
 *
 * The shared e2e servers keep every answer and comment earlier specs made. A spec that counts
 * submissions, or needs the plan as it is on disk, runs on one of these instead. Its port is also
 * its own browser origin, so the page's device store starts empty too.
 */
export function startPlanServer(port: number, mode: 'watch' | 'review' = 'watch'): Promise<ChildProcess> {
  const child = spawn('bun', ['scripts/e2e-server.ts'], {
    env: { ...process.env, E2E_PORT: String(port), E2E_MODE: mode },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('e2e server did not start')), 30_000)
    child.stdout?.on('data', (chunk: Buffer) => {
      if (!String(chunk).includes(`e2e ${mode}`)) return
      clearTimeout(timer)
      resolve(child)
    })
    child.once('exit', () => reject(new Error('e2e server exited')))
  })
}

export function stopPlanServer(child: ChildProcess | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve()
    child.once('exit', () => resolve())
    child.kill('SIGTERM')
  })
}

/** A fresh server for each test in this file. `current()` is the running one, for specs that restart it. */
export function useOwnPlanServer(port: number, mode: 'watch' | 'review' = 'watch') {
  let server: ChildProcess | undefined
  test.use({ baseURL: `http://127.0.0.1:${port}` })
  test.beforeEach(async () => {
    server = await startPlanServer(port, mode)
  })
  test.afterEach(async () => {
    await stopPlanServer(server)
  })
  return {
    current: () => server,
    stop: () => stopPlanServer(server),
    restart: async () => {
      await stopPlanServer(server)
      server = await startPlanServer(port, mode)
    },
  }
}
