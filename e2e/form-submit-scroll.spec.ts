import { expect, test } from '@playwright/test'
import { waitForCodeBlocks } from './fixtures/codeBlocks.ts'

// Submitting a plan form re-renders it in place. The plan is not hidden or rebuilt,
// so the page does not flicker and the scroll position stays where the person left it.

test('a submitted form keeps the scroll position and its element', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 500 })
  await page.goto('/')
  const form = page.locator('[data-entry="form"][data-entry-id="limits"]')
  await expect(form).toBeVisible()
  // The code blocks above the form change height once drawn. Read the position after that.
  await waitForCodeBlocks(page)
  await form.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollBy(0, 40))
  const before = await page.evaluate(() => window.scrollY)
  expect(before).toBeGreaterThan(200)
  await form.evaluate((node) => node.setAttribute('data-same-node', 'yes'))

  const hidden = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const root = document.getElementById('plan-mdx-root')
        const observer = new MutationObserver(() => {
          if (root?.classList.contains('plan-mdx-pending')) resolve(true)
        })
        if (root) observer.observe(root, { attributes: true, attributeFilter: ['class'] })
        setTimeout(() => resolve(false), 2500)
      }),
  )
  await form.getByRole('button', { name: /submit/i }).click()
  await expect(form).toHaveAttribute('data-same-node', 'yes')
  expect(await hidden).toBe(false)
  await expect(form).toContainText('Submitted')
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - before)).toBeLessThan(2)
})

// Edit and Submit share one spot. The Edit click must unlock the form, not submit it again.
test('Edit unlocks a submitted form without sending it again', async ({ page }) => {
  await page.goto('/')
  const form = page.locator('[data-entry="form"][data-entry-id="limits"]')
  await expect(form).toBeVisible()
  if (await form.getByRole('button', { name: /submit/i }).isVisible()) {
    await form.getByRole('button', { name: /submit/i }).click()
  }
  const edit = form.getByRole('button', { name: /edit/i })
  await expect(edit).toBeVisible()
  const posts: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/interactions/')) posts.push(request.url())
  })
  await edit.click()
  await expect(form.getByRole('button', { name: /submit/i })).toBeEnabled()
  await expect(form).toContainText('Editing')
  await page.waitForTimeout(300)
  expect(posts).toEqual([])
})
