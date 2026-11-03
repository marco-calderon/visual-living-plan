import { expect, test } from '@playwright/test'

// Submitting a plan form re-renders it in place. The plan is not hidden or rebuilt,
// so the page does not flicker and the scroll position stays where the person left it.

test('a submitted form keeps the scroll position and its element', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 500 })
  await page.goto('/')
  const form = page.locator('[data-entry="form"][data-entry-id="limits"]')
  await expect(form).toBeVisible()
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
