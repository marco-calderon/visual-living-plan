import { expect, test } from '@playwright/test'

// A choice stays open after the first pick. Picking another option posts again and replaces the answer.
test('a picked choice can be changed, and each pick is sent', async ({ page }) => {
  await page.goto('/')
  const choice = page.locator('[data-entry="choice"][data-entry-id="fail-mode"]')
  await expect(choice).toBeVisible()
  const sent: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/interactions/fail-mode')) {
      sent.push(String((request.postDataJSON() as { optionId?: string }).optionId))
    }
  })
  const open = choice.locator('[data-option-id="open"]')
  const closed = choice.locator('[data-option-id="closed"]')
  await open.click()
  await expect(open.getByRole('radio')).toBeChecked()
  await closed.click()
  await expect(closed.getByRole('radio')).toBeChecked()
  await expect(choice.locator('[data-state-for="fail-mode"]')).toContainText(/closed/i)
  await expect.poll(() => sent).toEqual(['open', 'closed'])
  await page.reload()
  await expect(choice.locator('[data-option-id="closed"]').getByRole('radio')).toBeChecked()
})
