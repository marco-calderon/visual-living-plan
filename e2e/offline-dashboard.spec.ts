import { expect, test } from '@playwright/test'

type OfflineWindow = Window & {
  __livingPlanOffline?: {
    available?: boolean
    plan?: (id: string) => { source?: string } | undefined
  }
}

test('an offline reload renders the plan saved on this device', async ({ page, context }) => {
  await page.goto('/')
  const opfs = await page.evaluate(async () => {
    try {
      await navigator.storage.getDirectory()
      return true
    } catch {
      return false
    }
  })
  test.skip(!opfs, 'Chromium has no OPFS')

  // The worker controls the pages that load after it is active. A reload sent while it activates
  // stays uncontrolled, so wait for it first.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller))
  await page.waitForFunction(() => Boolean((window as OfflineWindow).__livingPlanOffline?.plan?.('local')?.source))

  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('#plan-title')).toHaveText('Rate limiting rollout')
  await expect.poll(() => page.evaluate(() => (window as OfflineWindow).__livingPlanOffline?.plan?.('local')?.source ?? '')).toContain('Rate limiting rollout')

  await page.goto('/plans/notcached1')
  await expect(page.getByText('This plan is not saved on this device yet.')).toBeVisible()
})
