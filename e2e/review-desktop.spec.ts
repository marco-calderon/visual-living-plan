import { expect, test } from '@playwright/test'

test.use({ baseURL: 'http://127.0.0.1:9479' })

test('review mode accepts a verdict on the desktop page', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-plan-mode-chip]')).toHaveText('review')
  const review = page.getByRole('region', { name: 'Review this plan' })
  await expect(review).toBeVisible()
  await review.getByRole('button', { name: 'Deny' }).click()
  await expect(page.getByRole('status')).toHaveText(/Review deny|Review submitted/)
  await expect(review).toBeHidden()
  await expect(page.locator('[data-review-chip]')).toContainText('deny')
})
