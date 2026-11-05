import { spawn, type ChildProcess } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'

/**
 * The page follows a run as the agent starts and stops it, without a reload, and catches up on
 * a stop it missed while its service was down.
 *
 * These tests run on a plan server of their own, so they can restart it and leave the shared
 * e2e servers alone.
 */

const PORT = 9481
const ORIGIN = `http://127.0.0.1:${PORT}`

test.use({ baseURL: ORIGIN })
test.describe.configure({ mode: 'serial' })

function startServer(): Promise<ChildProcess> {
  const child = spawn('bun', ['scripts/e2e-server.ts'], {
    env: { ...process.env, E2E_PORT: String(PORT), E2E_MODE: 'watch' },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('e2e server did not start')), 30_000)
    child.stdout?.on('data', (chunk: Buffer) => {
      if (!String(chunk).includes('e2e watch')) return
      clearTimeout(timer)
      resolve(child)
    })
    child.once('exit', () => reject(new Error('e2e server exited')))
  })
}

function stopServer(child: ChildProcess | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve()
    child.once('exit', () => resolve())
    child.kill('SIGTERM')
  })
}

let server: ChildProcess | undefined

test.beforeEach(async () => {
  server = await startServer()
})

test.afterEach(async () => {
  await stopServer(server)
})

async function execution(page: Page, action: 'start' | 'push' | 'stop', body: Record<string, unknown> = {}) {
  const response = await page.request.post(`/api/execution/${action}`, { data: body })
  expect(response.ok()).toBe(true)
}

const status = (page: Page) => page.locator('body')
const label = (page: Page) => page.locator('.plan-status-chip [data-plan-status-label]')
const banner = (page: Page) => page.locator('[data-lock-banner]')

test('a start and a stop show on the open page without a reload', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-plan-rendered]')).toBeVisible()
  await expect(status(page)).toHaveAttribute('data-plan-connection', 'open')
  await expect(status(page)).toHaveAttribute('data-plan-status', 'stopped')
  await expect(banner(page)).toBeHidden()
  // A reload would clear this marker.
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true))

  await execution(page, 'start', { step: 'Build the limiter' })
  await expect(status(page)).toHaveAttribute('data-plan-status', 'running')
  await expect(label(page)).toHaveText('Running')
  await expect(status(page)).toHaveAttribute('data-plan-execution', 'live')
  await expect(page.locator('[data-tab-panel="plan"]')).toHaveClass(/plan-locked/)
  await expect(banner(page)).not.toHaveAttribute('hidden', '')
  await expect(page.locator('.execution-kicker')).toHaveText('Live workflow')
  await expect(page.getByRole('heading', { name: 'Build the limiter' })).toBeVisible()

  await execution(page, 'push', { detail: 'Halfway there' })
  await expect(page.getByText('Halfway there')).toBeVisible()

  await execution(page, 'stop')
  await expect(status(page)).toHaveAttribute('data-plan-status', 'stopped')
  await expect(label(page)).toHaveText('Stopped')
  await expect(page.locator('[data-tab-panel="plan"]')).not.toHaveClass(/plan-locked/)
  await expect(banner(page)).toHaveAttribute('hidden', '')
  // Stop keeps the last step on the Workflow tab.
  await expect(page.getByRole('heading', { name: 'Build the limiter' })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true)
})

test('a page follows the plan again after its service restarts', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await expect(status(page)).toHaveAttribute('data-plan-connection', 'open')
  await execution(page, 'start', { step: 'Before the restart' })
  await expect(status(page)).toHaveAttribute('data-plan-status', 'running')

  // The service goes away, the way it does when the CLI restarts it for a new version.
  await stopServer(server)
  await expect(status(page)).toHaveAttribute('data-plan-connection', 'reconnecting')
  // A drop longer than a moment says so, because the status shown may be out of date.
  await expect(label(page)).toHaveText('Reconnecting')

  // The new service has no run. The page hears that from hello when it reconnects, with no event sent.
  server = await startServer()
  await expect(status(page)).toHaveAttribute('data-plan-connection', 'open', { timeout: 30_000 })
  await expect(status(page)).toHaveAttribute('data-plan-status', 'stopped')
  await expect(label(page)).toHaveText('Stopped')
  await expect(banner(page)).toHaveAttribute('hidden', '')

  // And the stream it opened carries the next start.
  await execution(page, 'start', { step: 'After the restart' })
  await expect(status(page)).toHaveAttribute('data-plan-status', 'running')
})

test('a page restored from the back-forward cache opens its stream again', async ({ page }) => {
  await page.goto('/')
  await expect(status(page)).toHaveAttribute('data-plan-connection', 'open')
  // pagehide closes the stream, the way leaving the page does.
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
  })
  await execution(page, 'start', { step: 'While away' })
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
  })
  await expect(status(page)).toHaveAttribute('data-plan-status', 'running')
  await expect(page.getByRole('heading', { name: 'While away' })).toBeVisible()
})
