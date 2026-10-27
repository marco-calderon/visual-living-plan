import { expect, test } from '@playwright/test'

test('a workflow node title jumps to the plan entry and Back returns', async ({ page }) => {
  await page.goto('/')
  const step = page.locator('a.workflow-step[data-plan-jump="design"]')
  await step.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'auto' }))
  const before = await page.evaluate(() => window.scrollY)
  expect(before).toBeGreaterThan(200)

  await step.click({ force: true })
  await expect(page).toHaveURL(/#plan-design$/)
  await expect(page.locator('#plan-design')).toBeInViewport()
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

  await page.evaluate(() => history.back())
  await expect(page.getByRole('tab', { name: 'Workflow' })).toHaveAttribute('aria-selected', 'true')
  await expect(page).toHaveURL('/')
})
