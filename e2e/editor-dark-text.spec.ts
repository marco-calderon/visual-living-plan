import { expect, test } from '@playwright/test'

test.use({ colorScheme: 'dark' })

// MDXEditor gives its editable area a near-black text color. List items, bold, and code inherit
// it, so in dark mode they nearly vanished. The editor's text should be the plan's ink.
test('editor text uses the ink color in dark mode', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const content = page.locator('.plan-editor-content').first()
  await expect(content).toBeVisible()

  const [text, ink] = await content.evaluate((element) => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--ink)'
    document.body.append(probe)
    const ink = getComputedStyle(probe).color
    probe.remove()
    return [getComputedStyle(element).color, ink]
  })
  expect(ink).toBe('rgb(237, 237, 237)')
  expect(text).toBe(ink)

  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('[data-plan-rendered]')).toBeVisible()
})
