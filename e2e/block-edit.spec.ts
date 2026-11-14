import { expect, test, type Page } from '@playwright/test'
import { waitForCodeBlocks } from './fixtures/codeBlocks.ts'
import { clickTextAt, inlineEditor, pointAtWord } from './fixtures/inlineEdit.ts'
import { useOwnPlanServer } from './fixtures/ownServer.ts'

// Edits and applies the plan, and keeps drafts. Its own server keeps them off the shared plan.
useOwnPlanServer(9486)

/** The plan's first block sits right under the fixed toolbar: 60px bar and 16px of room. */
const PLAN_TOP = 76

const intro = (page: Page) => page.locator('[data-plan-rendered] > p[data-plan-block]').first()
const choice = (page: Page) => page.locator('[data-plan-rendered] [data-entry="choice"]').first()
const tools = (page: Page) => page.locator('[data-plan-block-tools]')
const editor = (page: Page) => page.locator('[data-plan-block-editor]')

async function openPlan(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('[data-plan-rendered]')).toBeVisible()
  await expect(page.locator('body')).toHaveAttribute('data-plan-editable', 'true')
  // The specs click words by where they are on screen; code blocks that finish drawing later move them.
  await waitForCodeBlocks(page)
}

async function planSource(page: Page): Promise<string> {
  return page.evaluate(async () => ((await (await fetch('/api/plan-mdx', { cache: 'no-store' })).json()) as { source: string }).source)
}

/** A point in the empty gutter right of the plan column, level with `y`. */
async function gutter(page: Page, y: number): Promise<{ x: number; y: number }> {
  const right = await page.locator('[data-plan-rendered]').evaluate((node) => node.getBoundingClientRect().right)
  return { x: right + 160, y }
}

test('the toolbar has no Edit button; text shows no pill, and a component under the pointer shows Edit and +', async ({ page }) => {
  await openPlan(page)
  await expect(page.locator('.titlebar [data-plan-edit], .plan-edit-btn')).toHaveCount(0)
  const top = await page.locator('[data-plan-rendered]').evaluate((node) => Math.round(node.getBoundingClientRect().top))
  expect(top).toBe(PLAN_TOP)

  // Plain text is edited as it reads: no Edit button on it.
  await intro(page).hover()
  await page.waitForTimeout(400)
  await expect(tools(page)).not.toHaveAttribute('data-visible', '')

  await choice(page).hover()
  await expect(tools(page)).toHaveAttribute('data-visible', '')
  await expect(page.locator('[data-plan-block-edit]')).toHaveAccessibleName('Edit this block')
  await expect(page.locator('[data-plan-block-add]')).toHaveAccessibleName('Add a block below')
  // A form keeps its default lock, so it offers no Edit.
  await page.locator('[data-plan-rendered] [data-entry="form"]').first().hover()
  await expect(tools(page)).not.toHaveAttribute('data-visible', '', { timeout: 2_000 })

  // Text inside a phase shows the phase's Edit, beside the phase.
  const phase = page.locator('[data-plan-rendered] [data-entry="phase"]').filter({ hasText: 'Ship dashboards and alerts' })
  await phase.getByText('Emit reject counts').hover()
  await expect(tools(page)).toHaveAttribute('data-visible', '')
  const [pill, card] = [await tools(page).boundingBox(), await phase.boundingBox()]
  expect(pill && card && pill.x > card.x + card.width).toBe(true)
})

test('the pill stays while the pointer goes to it and back onto the block', async ({ page }) => {
  await openPlan(page)
  const prompt = choice(page).getByText('If Redis is unreachable')
  await prompt.hover()
  await expect(tools(page)).toHaveAttribute('data-visible', '')
  const pill = await tools(page).boundingBox()
  const text = await prompt.boundingBox()
  if (!pill || !text) throw new Error('no pill or prompt on screen')

  // Over the gap to the pill, then back over the gap onto the block.
  await page.mouse.move(pill.x + 12, pill.y + pill.height / 2, { steps: 12 })
  await page.waitForTimeout(100)
  await page.mouse.move(text.x + 40, text.y + text.height / 2, { steps: 12 })
  // Longer than the pill waits once the pointer leaves a block.
  await page.waitForTimeout(800)
  await expect(tools(page)).toHaveAttribute('data-visible', '')

  // It still goes once the pointer leaves the block for good.
  const away = await gutter(page, text.y + 400)
  await page.mouse.move(away.x, away.y, { steps: 6 })
  await expect(tools(page)).not.toHaveAttribute('data-visible', '', { timeout: 2_000 })
})

test('a click on text edits it where it reads, with the caret where the click landed, and Apply changes saves it', async ({ page }) => {
  await openPlan(page)
  const before = await intro(page).boundingBox()
  const next = page.locator('[data-plan-rendered] > p[data-plan-block] + *').first()
  const nextTop = (await next.boundingBox())?.y

  await clickTextAt(page, intro(page), 'sliding-window')
  // Only that paragraph turned into an editor, in its own place and look: no frame and no bar.
  await expect(editor(page)).toHaveCount(1)
  await expect(page.locator('[data-plan-block-done]')).toHaveCount(0)
  const opened = await inlineEditor(page).locator('.plan-editor-content > p').first().boundingBox()
  expect(Math.abs((opened?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(1)
  expect(Math.abs((opened?.height ?? 0) - (before?.height ?? 0))).toBeLessThan(1)
  expect(Math.abs(((await inlineEditor(page).evaluate((node) => node.nextElementSibling?.getBoundingClientRect().top)) ?? 0) - (nextTop ?? 0))).toBeLessThan(1)
  await expect(page.locator('[data-plan-rendered] h1').first()).toBeVisible()

  await page.keyboard.type('new ')
  await expect(inlineEditor(page)).toContainText('We add a new sliding-window limiter')
  // A click elsewhere on the page keeps it.
  const away = await gutter(page, (before?.y ?? 0) + 200)
  await page.mouse.click(away.x, away.y)
  await expect(editor(page)).toHaveCount(0)
  await expect(intro(page)).toContainText('We add a new sliding-window limiter')
  const bar = page.locator('[data-plan-apply-bar]')
  await expect(bar).toContainText('1 change not applied')
  // Nothing reached the plan yet.
  expect(await planSource(page)).not.toContain('a new sliding-window')

  // The change is kept on this device.
  await page.reload()
  await expect(intro(page)).toContainText('a new sliding-window')
  await expect(bar).toBeVisible()

  await page.locator('[data-plan-apply]').click()
  await expect(bar).toHaveCount(0)
  await expect.poll(() => planSource(page)).toContain('We add a new sliding-window limiter')
  await expect(intro(page)).toContainText('a new sliding-window')
})

test('Escape closes untouched text as it was, and keeps what was typed', async ({ page }) => {
  await openPlan(page)
  await clickTextAt(page, intro(page), 'gateway')
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveCount(0)
  await expect(page.locator('[data-plan-apply-bar]')).toHaveCount(0)

  await clickTextAt(page, intro(page), 'gateway')
  await page.keyboard.type('API ')
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveCount(0)
  await expect(intro(page)).toContainText('at the API gateway')
  await expect(page.locator('[data-plan-apply-bar]')).toContainText('1 change not applied')
})

test('a click on other text keeps the open edit and puts the caret in that text', async ({ page }) => {
  await openPlan(page)
  await clickTextAt(page, intro(page), 'behind')
  await page.keyboard.type('quietly ')
  // Text on the same screen: right after a keystroke the editor puts the page back if it scrolls.
  const title = page.locator('[data-plan-rendered] > h1')
  const point = await pointAtWord(title, 'limiting')
  await page.mouse.click(point.x, point.y)
  await expect(inlineEditor(page)).toContainText('Rate limiting rollout')
  await expect(inlineEditor(page).locator('[contenteditable="true"]')).toBeFocused()
  await expect(intro(page)).toContainText('quietly behind a flag')
  await page.keyboard.type('API ')
  await page.keyboard.press('Control+Enter')
  await expect(editor(page)).toHaveCount(0)
  await expect(title).toHaveText('Rate API limiting rollout')
  await expect(page.locator('[data-plan-apply-bar]')).toContainText('2 changes not applied')
})

test('dragging over text selects it and opens no editor', async ({ page }) => {
  await openPlan(page)
  const from = await pointAtWord(intro(page), 'sliding')
  const to = await pointAtWord(intro(page), 'limiter')
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x + 30, to.y, { steps: 6 })
  await page.mouse.up()
  expect(await page.evaluate(() => String(window.getSelection()))).toContain('sliding-window')
  await page.waitForTimeout(300)
  await expect(editor(page)).toHaveCount(0)
})

test('+ on a component opens an empty block below with the / hint, and Cancel leaves the plan as it was', async ({ page }) => {
  await openPlan(page)
  await choice(page).hover()
  await page.locator('[data-plan-block-add]').click()
  await expect(page.locator('[data-plan-block-editor="add"] [contenteditable="true"].plan-editor-content')).toBeVisible()
  const hint = page.locator('[data-plan-block-editor="add"] [data-slash-hint]')
  await expect(hint).toHaveCount(1)
  expect(await hint.evaluate((node) => getComputedStyle(node, '::before').content)).toBe('"Type / to add a block"')
  // A line with text has no hint.
  await page.keyboard.type('New')
  await expect(hint).toHaveCount(0)
  await page.locator('[data-plan-block-cancel]').click()
  await expect(editor(page)).toHaveCount(0)
  await expect(page.locator('[data-plan-apply-bar]')).toHaveCount(0)
})

test('Add a block at the end, clearing a paragraph takes it out, and Remove takes a diagram out', async ({ page }) => {
  await openPlan(page)
  await page.locator('[data-plan-add-block]').click()
  await expect(page.locator('[data-plan-block-editor="add"]')).toBeVisible()
  await page.keyboard.type('A closing note.')
  await page.locator('[data-plan-block-done]').click()
  await expect(page.locator('[data-plan-rendered] > p', { hasText: 'A closing note.' })).toBeVisible()

  const text = (await intro(page).innerText()).slice(0, 40)
  await clickTextAt(page, intro(page), 'sliding')
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Control+Enter')
  await expect(editor(page)).toHaveCount(0)
  await expect(page.locator('[data-plan-rendered] p', { hasText: text })).toHaveCount(0)

  const diagrams = page.locator('[data-plan-rendered] > .plan-block-frame')
  const count = await diagrams.count()
  await diagrams.first().hover()
  await page.locator('[data-plan-block-edit]').click()
  await page.locator('[data-plan-block-remove]').click()
  await expect(page.locator('[data-plan-block-remove]')).toHaveText('Remove this block?')
  await page.locator('[data-plan-block-remove]').click()
  await expect(editor(page)).toHaveCount(0)
  await expect(diagrams).toHaveCount(count - 1)
  await expect(page.locator('[data-plan-apply-bar]')).toContainText('3 changes not applied')

  await page.locator('[data-plan-discard]').click()
  await page.locator('[data-plan-discard]').click()
  await expect(page.locator('[data-plan-apply-bar]')).toHaveCount(0)
  await expect(page.locator('[data-plan-rendered] p', { hasText: text }).first()).toBeVisible()
  await expect(diagrams).toHaveCount(count)
})

test('E edits the block with focus, or the text under the pointer, and typing an E in a field is just typing', async ({ page }) => {
  await openPlan(page)
  await page.evaluate(() => document.body.append(Object.assign(document.createElement('input'), { id: 'probe' })))
  await page.locator('#probe').press('e')
  await expect(editor(page)).toHaveCount(0)
  await page.evaluate(() => document.getElementById('probe')?.remove())

  const option = choice(page).getByRole('radio').first()
  await option.focus()
  await page.keyboard.press('e')
  const open = page.locator('[data-plan-block-editor="edit"]')
  await expect(open).toBeVisible()
  await expect(open.locator('[data-editor-entry="choice"]')).toBeVisible()
  // Nothing typed yet: Escape closes it.
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveCount(0)

  await page.locator('body').evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await intro(page).hover()
  await page.keyboard.press('e')
  await expect(inlineEditor(page).locator('[contenteditable="true"]')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveCount(0)
})

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 800 } })

  test('a tap on text edits it, and a tap on a component shows its Edit', async ({ page }) => {
    await openPlan(page)
    await intro(page).tap()
    await expect(inlineEditor(page).locator('[contenteditable="true"]')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(editor(page)).toHaveCount(0)

    await choice(page).getByText('If Redis is unreachable').tap()
    await expect(tools(page)).toHaveAttribute('data-visible', '')
    await page.locator('[data-plan-block-edit]').tap()
    await expect(page.locator('[data-plan-block-editor="edit"]')).toBeVisible()
    // Every control of the editor's bar fits on the phone.
    const right = await page.locator('.plan-block-editor-bar').evaluate((bar) =>
      Math.max(...[...bar.querySelectorAll('button')].map((button) => button.getBoundingClientRect().right)),
    )
    expect(right).toBeLessThanOrEqual(390)
  })
})
