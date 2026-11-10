import { expect, test } from '@playwright/test'
import { waitForCodeBlocks } from './fixtures/codeBlocks.ts'

test('a workflow node title jumps to the plan entry and Back returns', async ({ page }) => {
  await page.goto('/')
  // The plan's workflow diagram links each step to its entry.
  const step = page.locator('#plan-mdx-root a[data-plan-jump="design"]').first()
  await expect(step).toBeAttached()
  // The page height changes once the code blocks are drawn, so wait before reading the bottom.
  await waitForCodeBlocks(page)
  // Start far from the entry, so the jump moves the page and Back has a position to restore.
  // The plan grows as it renders, so scroll until the bottom holds.
  await expect
    .poll(() => page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight)
      return window.scrollY
    }))
    .toBeGreaterThan(1000)
  const before = await page.evaluate(() => window.scrollY)

  await step.dispatchEvent('click')
  await expect(page).toHaveURL(/#plan-design$/)
  await expect(page.locator('#plan-design')).toBeInViewport()
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(before - 200)
  const origin = new URL(page.url())
  expect(origin.pathname).toBe('/')

  await page.evaluate(() => history.back())
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 40)
  await expect(page).toHaveURL('/')

  await page.getByRole('tab', { name: 'Workflow' }).click()
  const workflow = page.locator('[data-tab-panel="workflow"]')
  const title = workflow.getByRole('link', { name: 'Confirm limiter design' })
  await expect(title).toHaveAttribute('href', '#plan-design')
  await title.click({ force: true })

  await expect(page.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/#plan-design$/)
  await expect(page.locator('#plan-design')).toBeInViewport()
  expect(new URL(page.url()).pathname).toBe('/')

  // Opening the Workflow tab was its own history step, so Back from the jump returns to that tab.
  await page.evaluate(() => history.back())
  await expect(page.getByRole('tab', { name: 'Workflow' })).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL(/\/#workflow$/)
})
