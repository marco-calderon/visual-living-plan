import { expect, test } from '@playwright/test'
import { useOwnPlanServer } from './fixtures/ownServer.ts'

// Review turns comments on, and comments grab clicks on the plan. A click on an answer control used
// to open a comment instead, so Approve sent nothing and the agent never heard it.

useOwnPlanServer(9487, 'review')

test('an approve gate answers while comments are on', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-comments', 'on')
  const gate = page.locator('[data-entry="approve"][data-entry-id="proceed-implement"]')
  const popover = page.locator('.plan-comment-popover')

  // The note box takes typing, not a comment.
  const note = gate.locator('textarea[data-approve-note="proceed-implement"]')
  await note.click()
  await expect(popover).toHaveCount(0)
  await note.fill('Ship behind the flag')

  const answered = page.waitForResponse(
    (response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/api/interactions/proceed-implement'),
  )
  await gate.locator('button[data-approved="true"]').click()
  expect((await answered).status()).toBe(200)
  await expect(popover).toHaveCount(0)
  await expect(gate.locator('[data-state-for="proceed-implement"]')).toHaveText('Approved')

  // The answer is stored for the agent's listener.
  const snapshot = await page.evaluate(async () => (await fetch('/api/snapshot')).json())
  expect(snapshot.responses?.['proceed-implement']).toMatchObject({ kind: 'approve', approved: true, note: 'Ship behind the flag' })
})

test('a choice option answers while comments are on, and the card still takes a comment', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-comments', 'on')
  const choice = page.locator('[data-entry="choice"][data-entry-id="fail-mode"]')
  const popover = page.locator('.plan-comment-popover')

  await choice.locator('.plan-title').click()
  await expect(popover).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)

  const answered = page.waitForResponse(
    (response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/api/interactions/fail-mode'),
  )
  await choice.locator('[data-option-id="open"] .plan-choice-label').click()
  expect((await answered).status()).toBe(200)
  await expect(popover).toHaveCount(0)
})
