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
