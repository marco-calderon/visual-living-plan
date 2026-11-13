import { expect, type Locator, type Page } from '@playwright/test'

/** The editor that text opens in when it is clicked: in its place, with no frame or bar (ADR 0040). */
export const inlineEditor = (page: Page) => page.locator('[data-plan-block-editor][data-inline]')

/** Where a word of `block` is on screen: the middle of its first letter. */
export async function pointAtWord(block: Locator, word: string): Promise<{ x: number; y: number }> {
  const point = await block.evaluate((node, word) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
    for (let text = walker.nextNode() as Text | null; text; text = walker.nextNode() as Text | null) {
      const at = text.data.indexOf(word)
      if (at < 0) continue
      const range = document.createRange()
      range.setStart(text, at)
      range.setEnd(text, at + 1)
      const rect = range.getBoundingClientRect()
      return { x: rect.left + 1, y: rect.top + rect.height / 2 }
    }
    return null
  }, word)
  if (!point) throw new Error(`"${word}" is not in the block`)
  return point
}

/** Click just before `word` in a text block: the text opens for editing with the caret there. */
export async function clickTextAt(page: Page, block: Locator, word: string): Promise<Locator> {
  await block.scrollIntoViewIfNeeded()
  const point = await pointAtWord(block, word)
  await page.mouse.click(point.x, point.y)
  const content = inlineEditor(page).locator('[contenteditable="true"].plan-editor-content')
  await expect(content).toBeFocused()
  return content
}

/** Add `text` at the end of a text block, as a person does: click the text, go to its end, type, and finish with Ctrl+Enter. */
export async function appendToText(page: Page, block: Locator, word: string, text: string): Promise<void> {
  await clickTextAt(page, block, word)
  await page.keyboard.press('Control+End')
  await page.keyboard.type(text)
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('[data-plan-block-editor]')).toHaveCount(0)
}
