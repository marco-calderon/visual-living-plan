import { expect, test } from '@playwright/test'

test.use({ baseURL: 'http://127.0.0.1:9479' })

test('review mode accepts a verdict on the desktop page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Plan details' }).click()
  await expect(page.locator('[data-plan-mode-chip]')).toHaveText('review')
  await page.keyboard.press('Escape')
  const review = page.getByRole('region', { name: 'Review this plan' })
  await expect(review).toBeVisible()
  await review.getByRole('button', { name: 'Deny' }).click()
  // The plan toast is a Sonner toast.
  await expect(page.locator('[data-sonner-toast]')).toHaveText(/Review deny|Review submitted/)
  await expect(review).toBeHidden()
  await page.getByRole('button', { name: 'Plan details' }).click()
  await expect(page.locator('[data-review-chip]')).toContainText('deny')
  await expect(page.locator('[data-review-chip]')).toHaveAttribute('data-decision', 'deny')
})
