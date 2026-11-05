import { expect, test, type Page } from '@playwright/test'
import { useOwnPlanServer } from './fixtures/ownServer.ts'

/**
 * The page follows a run as the agent starts and stops it, without a reload, and catches up on
 * a stop it missed while its service was down.
 *
 * These tests run on a plan server of their own, so they can restart it and leave the shared
 * e2e servers alone.
 */

const server = useOwnPlanServer(9481)
test.describe.configure({ mode: 'serial' })

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

  // The Plan tab is in the URL when the run starts. The run opens the Workflow tab.
  await page.getByRole('tab', { name: 'Plan' }).click()
  await expect(page).toHaveURL(/#plan$/)
  await execution(page, 'start', { step: 'Build the limiter' })
  await expect(status(page)).toHaveAttribute('data-plan-status', 'running')
  await expect(page.getByRole('tab', { name: 'Workflow' })).toHaveAttribute('aria-selected', 'true')
  await expect(label(page)).toHaveText('Running')
  await expect(status(page)).toHaveAttribute('data-plan-execution', 'live')
  await expect(page.locator('[data-tab-panel="plan"]')).toHaveClass(/plan-locked/)
  await expect(banner(page)).not.toHaveAttribute('hidden', '')
  await expect(page.locator('.execution-kicker')).toHaveText('Live workflow')
  await expect(page.getByRole('heading', { name: 'Build the limiter' })).toBeVisible()
  // The Plan tab opens again though the URL already names it, and shows the lock.
  await page.getByRole('tab', { name: 'Plan' }).click()
  await expect(banner(page)).toBeVisible()
  await page.getByRole('tab', { name: 'Workflow' }).click()

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
  await server.stop()
  await expect(status(page)).toHaveAttribute('data-plan-connection', 'reconnecting')
  // A drop longer than a moment says so, because the status shown may be out of date.
  await expect(label(page)).toHaveText('Reconnecting')

  // The new service has no run. The page hears that from hello when it reconnects, with no event sent.
  await server.restart()
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
