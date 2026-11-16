import { expect, type Page } from '@playwright/test'

/**
 * Wait until the plan's code blocks are drawn.
 *
 * Code blocks load their highlighter lazily. Until it arrives each one shows a plain fallback of a
 * different height, so a scroll position read before then moves when the blocks settle.
 */
export async function waitForCodeBlocks(page: Page): Promise<void> {
  const hosts = page.locator('#plan-mdx-root .code-host[data-react-code]')
  await expect(hosts.first()).toBeAttached()
  await expect(hosts.locator(':scope > pre.code-block')).toHaveCount(0)
}

/**
 * Wait until the plan's diagrams are drawn at their final size.
 *
 * A diagram mounts empty and draws a moment later, then draws again once the web fonts arrive, and
 * each draw can change its height. A point read before then lands on whatever moved under it.
 */
export async function waitForDiagrams(page: Page): Promise<void> {
  const diagrams = page.locator('#plan-mdx-root .mermaid-diagram')
  await expect(diagrams.first()).toBeAttached()
  await expect(diagrams.filter({ hasNot: page.locator('svg') })).toHaveCount(0)
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
}
