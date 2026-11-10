import type { Locator, Page } from '@playwright/test'

/**
 * The title of the plan toast on screen.
 *
 * The plan toast is a Ding toast. Ding shows one at a time and morphs it for each new message, but a
 * toast that is closing stays in the page until it leaves, so the newest one is the last.
 */
export function planToast(page: Page): Locator {
  return page.locator('.tst-viewport .tst-title').last()
}
