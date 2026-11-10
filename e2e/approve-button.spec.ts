import { expect, test } from '@playwright/test'
import { useOwnPlanServer } from './fixtures/ownServer.ts'

// The corner Approve button is the only way to approve a hosted plan. A review writes nothing to
// the device store, and the device outbox used to settle such a write without sending it.

useOwnPlanServer(9485, 'review')

type OfflineWindow = Window & { __livingPlanOffline?: { available?: boolean; pendingCount?: () => number } }

test('the corner Approve button sends one review and returns the page to watch', async ({ page }) => {
  await page.goto('/')
  // The page stores plan writes on the device, which is the path that dropped the review.
  await expect.poll(() => page.evaluate(() => Boolean((window as OfflineWindow).__livingPlanOffline?.available))).toBe(true)
  const approve = page.locator('button.plan-approve-button')
  await expect(approve).toBeVisible()

  const sent: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/api/review')) sent.push(request.postData() ?? '')
  })
  const answered = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/api/review'))
  await approve.dblclick()
  expect((await answered).status()).toBe(200)

  await expect(approve).toBeHidden()
  await expect(page.locator('body')).toHaveAttribute('data-plan-mode', 'watch')
  const snapshot = await page.evaluate(async () => (await fetch('/api/snapshot')).json())
  expect(snapshot.mode).toBe('watch')
  expect(snapshot.review?.decision).toBe('approve')
  expect(sent).toHaveLength(1)
  expect(JSON.parse(sent[0] ?? '{}').decision).toBe('approve')
  await expect.poll(() => page.evaluate(() => (window as OfflineWindow).__livingPlanOffline?.pendingCount?.() ?? 0)).toBe(0)
})
