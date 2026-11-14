import { expect, test } from '@playwright/test'
import { clickTextAt } from './fixtures/inlineEdit.ts'

test.use({ colorScheme: 'dark' })

// MDXEditor gives its editable area a near-black text color. List items, bold, and code inherit
// it, so in dark mode they nearly vanished. The editor's text should be the plan's ink.
test('editor text uses the ink color in dark mode', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-plan-editable', 'true')
  // Text opens where it reads; a card opens with its Edit. Both are the same editor.
  await clickTextAt(page, page.locator('[data-plan-rendered] > p[data-plan-block]').first(), 'sliding')
  const content = page.locator('[data-plan-block-editor] .plan-editor-content').first()
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

  // Nothing typed: Escape closes it.
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-plan-block-editor]')).toHaveCount(0)
})
