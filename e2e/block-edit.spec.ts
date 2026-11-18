import { expect, test, type Locator, type Page } from '@playwright/test'
import { waitForCodeBlocks, waitForDiagrams } from './fixtures/codeBlocks.ts'
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
/** + under the block under the pointer. */
const addBar = (page: Page) => page.locator('[data-plan-block-add]')

/** The bar sits under the block, in the gap before the next one, as wide as the block. */
async function expectBarUnder(bar: Locator, block: Locator): Promise<void> {
  const [at, box] = [await bar.boundingBox(), await block.boundingBox()]
  if (!at || !box) throw new Error('no bar or block on screen')
  expect(at.y).toBeGreaterThanOrEqual(box.y + box.height - 1)
  expect(at.y).toBeLessThan(box.y + box.height + 32)
  expect(Math.abs(at.x - box.x)).toBeLessThan(1)
  expect(Math.abs(at.width - box.width)).toBeLessThan(1)
}

async function openPlan(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('[data-plan-rendered]')).toBeVisible()
  await expect(page.locator('body')).toHaveAttribute('data-plan-editable', 'true')
  // The specs click words by where they are on screen; code blocks and diagrams that finish drawing later move them.
  await waitForCodeBlocks(page)
  await waitForDiagrams(page)
}

async function planSource(page: Page): Promise<string> {
  return page.evaluate(async () => ((await (await fetch('/api/plan-mdx', { cache: 'no-store' })).json()) as { source: string }).source)
}

/** A point in the empty gutter right of the plan column, level with `y`. */
async function gutter(page: Page, y: number): Promise<{ x: number; y: number }> {
  const right = await page.locator('[data-plan-rendered]').evaluate((node) => node.getBoundingClientRect().right)
  return { x: right + 160, y }
}

test('the toolbar has no Edit button; text shows no pill, a card shows Edit, and every block has + under it', async ({ page }) => {
  await openPlan(page)
  await expect(page.locator('.titlebar [data-plan-edit], .plan-edit-btn')).toHaveCount(0)
  const top = await page.locator('[data-plan-rendered]').evaluate((node) => Math.round(node.getBoundingClientRect().top))
  expect(top).toBe(PLAN_TOP)

  // Plain text is edited as it reads: no Edit button on it, and + under it.
  await intro(page).hover()
  await page.waitForTimeout(400)
  await expect(tools(page)).not.toHaveAttribute('data-visible', '')
  await expect(addBar(page)).toHaveAttribute('data-visible', '')
  await expectBarUnder(addBar(page), intro(page))

  await choice(page).hover()
  await expect(tools(page)).toHaveAttribute('data-visible', '')
  await expect(page.locator('[data-plan-block-edit]')).toHaveAccessibleName('Edit this block')
  // + is not beside the card: it is under it.
  await expect(tools(page).locator('button')).toHaveCount(1)
  await expect(addBar(page)).toHaveAccessibleName('Add a block below')
  const card = page.locator('[data-plan-rendered] [data-plan-block]').filter({ has: page.locator('[data-entry="choice"]') }).first()
  await expectBarUnder(addBar(page), card)
  // A form keeps its default lock, so it offers no Edit; a block still goes after it.
  await page.locator('[data-plan-rendered] [data-entry="form"]').first().hover()
  await expect(tools(page)).not.toHaveAttribute('data-visible', '', { timeout: 2_000 })
  await expect(addBar(page)).toHaveAttribute('data-visible', '')

  // Text inside a phase opens itself with a click: no pill. + under it adds in the phase. It is the
  // page's one + bar: the phase's own shows in the gap under the phase, as any block's does.
  const phase = page.locator('[data-plan-rendered] [data-entry="phase"]').filter({ hasText: 'Ship dashboards and alerts' })
  const text = phase.locator('p[data-plan-block]')
  // The whole phase and the gap under it on screen.
  await phase.evaluate((node) => node.scrollIntoView({ block: 'center' }))
  await text.hover()
  await expect(tools(page)).not.toHaveAttribute('data-visible', '', { timeout: 2_000 })
  await expect(addBar(page)).toHaveAttribute('data-visible', '')
  await expect(page.locator('[data-plan-add-bar]')).toHaveCount(1)
  await expectBarUnder(addBar(page), text)
  const box = await phase.boundingBox()
  if (!box) throw new Error('no phase on screen')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 3, { steps: 4 })
  await expect.poll(async () => (await addBar(page).boundingBox())?.width).toBeCloseTo(box.width, 0)
  await expectBarUnder(addBar(page), phase)
  // The phase's title row shows the phase's Edit beside it, and its + under it.
  await phase.locator('.plan-title').hover()
  await expect(page.locator('[data-plan-block-edit]')).toBeVisible()
  await expectBarUnder(addBar(page), phase)
  const pill = await tools(page).boundingBox()
  expect(pill && pill.x > box.x + box.width).toBe(true)
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

test('+ under a card opens an empty line below it, as text reads, with the / hint; Escape leaves the plan as it was', async ({ page }) => {
  await openPlan(page)
  const card = page.locator('[data-plan-rendered] [data-plan-block]').filter({ has: page.locator('[data-entry="choice"]') }).first()
  await choice(page).hover()
  await addBar(page).click()
  const added = page.locator('[data-plan-block-editor="add"]')
  await expect(added).toHaveAttribute('data-inline', '')
  await expect(added.locator('[contenteditable="true"].plan-editor-content')).toBeFocused()
  // No frame and no bar: a new line of the page, right under the card.
  await expect(page.locator('.plan-block-editor-bar')).toHaveCount(0)
  expect(await added.evaluate((node) => getComputedStyle(node).borderTopWidth)).toBe('0px')
  const [above, line] = [await card.boundingBox(), await added.boundingBox()]
  expect(line && above && line.y >= above.y + above.height - 1).toBe(true)
  const hint = added.locator('[data-slash-hint]')
  await expect(hint).toHaveCount(1)
  expect(await hint.evaluate((node) => getComputedStyle(node, '::before').content)).toBe('"Type / to add a block"')
  // Nothing typed: Escape closes it, and nothing waits to be applied.
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveCount(0)
  await expect(page.locator('[data-plan-apply-bar]')).toHaveCount(0)

  // A line with text has no hint, and the first key counts as a change to apply. Escape keeps it.
  await choice(page).hover()
  await addBar(page).click()
  await page.keyboard.type('New')
  await expect(hint).toHaveCount(0)
  await expect(page.locator('[data-plan-apply-bar]')).toContainText('1 change not applied')
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveCount(0)
  await expect(card.locator('xpath=following-sibling::*[1]')).toHaveText('New')
  await expect(page.locator('[data-plan-apply-bar]')).toContainText('1 change not applied')
})

test('Add a block at the end opens an empty line there, clearing a paragraph takes it out, and the grip deletes a diagram', async ({ page }) => {
  await openPlan(page)
  // The end of the plan keeps room under Add a block.
  expect(await page.locator('[data-plan-add-block]').evaluate((node) => getComputedStyle(node).marginBottom)).toBe('32px')
  await page.locator('[data-plan-add-block]').click()
  await expect(page.locator('[data-plan-block-editor="add"]')).toHaveAttribute('data-inline', '')
  await page.keyboard.type('A closing note.')
  await page.keyboard.press('Control+Enter')
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
  await page.locator('[data-plan-block-move]').click()
  const remove = page.locator('[data-plan-block-move-delete]')
  await remove.click()
  await expect(remove).toHaveText('Delete this block?')
  await remove.click()
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
  // Only the card's own editor: no frame, no bar, no line under it, and the caret in its first field,
  // with no focus ring. The card's own delete is small and red, inside its top right corner; its
  // options keep their quiet ones.
  await expect(open.getByLabel('Prompt')).toBeFocused()
  expect(await open.getByLabel('Prompt').evaluate((node) => getComputedStyle(node).outlineStyle)).toBe('none')
  await expect(open.locator('.plan-block-editor-bar')).toHaveCount(0)
  expect(await open.evaluate((node) => getComputedStyle(node).borderTopWidth)).toBe('0px')
  await expect(open.locator('[data-slash-hint]')).toHaveCount(0)
  const remove = open.getByLabel('Remove choice')
  await expect(remove).toBeVisible()
  expect(await remove.evaluate((node) => getComputedStyle(node).color)).toBe('rgb(239, 77, 62)')
  const [trash, frame] = [await remove.boundingBox(), await open.locator('[data-editor-entry="choice"]').boundingBox()]
  expect(trash && frame && trash.x + trash.width <= frame.x + frame.width && trash.x + trash.width > frame.x + frame.width - 60).toBe(true)
  expect(trash && frame && trash.y >= frame.y && trash.y < frame.y + 40).toBe(true)
  await expect(open.getByLabel('Remove option').first()).toBeVisible()
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

test('A adds an empty line below the block under the pointer, as + does', async ({ page }) => {
  await openPlan(page)
  await intro(page).hover()
  await page.keyboard.press('a')
  const added = page.locator('[data-plan-block-editor="add"]')
  await expect(added).toHaveAttribute('data-inline', '')
  await expect(added.locator('[contenteditable="true"]')).toBeFocused()
  const before = (await intro(page).innerText()).slice(0, 30)
  expect(await added.evaluate((node) => (node.previousElementSibling?.textContent ?? '').slice(0, 30))).toBe(before)
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveCount(0)
})

test('Edit on a code block puts the caret in its code, not on its language', async ({ page }) => {
  await openPlan(page)
  const code = page.locator('[data-plan-rendered] .code-host').first()
  await code.scrollIntoViewIfNeeded()
  await code.hover({ position: { x: 300, y: 20 } })
  // The pill shows beside the code block's first line, and is pressed where it is. A click that
  // scrolls the pill into view first moves the page under the pointer, which can then be on the
  // phase's title, and the pill goes to the phase.
  const pill = page.locator('[data-plan-block-tools]')
  await expect(pill).toHaveAttribute('data-visible', '')
  await expect
    .poll(async () => Math.abs(((await pill.boundingBox())?.y ?? 0) - ((await code.boundingBox())?.y ?? 0)))
    .toBeLessThan(1)
  const at = await page.locator('[data-plan-block-edit]').boundingBox()
  if (!at) throw new Error('no Edit pill on screen')
  await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2)
  const fence = page.locator('[data-plan-block-editor] [data-code-fence]')
  await expect(fence).toBeVisible()
  // The code editor types in a shadow root of its own.
  await expect
    .poll(() =>
      page.evaluate(() => {
        let active = document.activeElement
        while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
        const host = (active?.getRootNode() as ShadowRoot | Document | undefined) instanceof ShadowRoot ? (active!.getRootNode() as ShadowRoot).host : active
        return Boolean(host?.closest('[data-code-fence]')) && active?.getAttribute('contenteditable') === 'true'
      }),
    )
    .toBe(true)
  await page.mouse.click(5, 450)
  await expect(editor(page)).toHaveCount(0)
})

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 800 } })

  test('on an iPad, a tap on any card shows its Edit over its top right corner', async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1194 })
    await openPlan(page)
    for (const card of [choice(page), page.locator('[data-plan-rendered] [data-entry="callout"]').first(), page.locator('[data-plan-rendered] .code-host').first()]) {
      await card.scrollIntoViewIfNeeded()
      const box = await card.boundingBox()
      if (!box) throw new Error('no card on screen')
      await page.touchscreen.tap(box.x + box.width * 0.35, box.y + Math.min(box.height / 2, 60))
      // Whether the tap opened the card's text or not, the card's Edit is there.
      await expect(tools(page)).toHaveAttribute('data-visible', '')
      await expect(page.locator('[data-plan-block-edit]')).toBeVisible()
      const pill = await tools(page).boundingBox()
      expect(pill && pill.x + pill.width).toBeLessThanOrEqual(box.x + box.width + 1)
      expect(pill && pill.x + pill.width).toBeGreaterThan(box.x + box.width - 4)
      await page.keyboard.press('Escape')
      await expect(editor(page)).toHaveCount(0)
    }
  })

  test("a tap on text edits it at once, in a card too, and the card's Edit shows beside it", async ({ page }) => {
    await openPlan(page)
    await intro(page).tap()
    await expect(inlineEditor(page).locator('[contenteditable="true"]')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(editor(page)).toHaveCount(0)

    // A card's title takes the caret at the tap, and the card's Edit shows while it is open.
    const prompt = choice(page).locator('[data-plan-title]')
    await prompt.tap()
    await expect(prompt).toBeFocused()
    await expect(tools(page)).toHaveAttribute('data-visible', '')
    await expect(page.locator('[data-plan-block-edit]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-plan-title-editing]')).toHaveCount(0)

    // Text inside a card the same way.
    const note = page.locator('[data-plan-rendered] [data-entry="callout"] p[data-plan-text]').first()
    await note.scrollIntoViewIfNeeded()
    await note.tap()
    await expect(inlineEditor(page).locator('[contenteditable="true"]')).toBeFocused()
    await expect(tools(page)).toHaveAttribute('data-visible', '')
    await expect(page.locator('[data-plan-block-edit]')).toBeVisible()
    // Its Edit keeps what was typed, then opens the card's own editor.
    await page.keyboard.press('Control+End')
    await page.keyboard.type(' Typed.')
    await page.locator('[data-plan-block-edit]').tap()
    await expect(page.locator('[data-plan-block-editor="edit"]:not([data-inline])')).toBeVisible()
    await expect(page.locator('[data-plan-block-editor] .plan-editor-body')).toContainText('Typed.')
    await page.keyboard.press('Escape')
    await expect(editor(page)).toHaveCount(0)

    await choice(page).getByText('Needs your choice').tap()
    await expect(tools(page)).toHaveAttribute('data-visible', '')
    // A tap shows + under the card too.
    await expect(addBar(page)).toHaveAttribute('data-visible', '')
    await page.locator('[data-plan-block-edit]').tap()
    const open = page.locator('[data-plan-block-editor="edit"]')
    await expect(open).toBeVisible()
    // The card's editor fits the phone, with no bar of its own.
    await expect(open.locator('.plan-block-editor-bar')).toHaveCount(0)
    const right = await open.evaluate((node) => node.getBoundingClientRect().right)
    expect(right).toBeLessThanOrEqual(390)
  })

  test("a card's Edit comes back when its open text scrolls away and back", async ({ page }) => {
    await openPlan(page)
    const note = page.locator('[data-plan-rendered] [data-entry="callout"] p[data-plan-text]').first()
    await note.scrollIntoViewIfNeeded()
    await note.tap()
    await expect(inlineEditor(page).locator('[contenteditable="true"]')).toBeFocused()
    await expect(tools(page)).toHaveAttribute('data-visible', '')
    const top = await page.evaluate(() => window.scrollY)
    // Out of view, the pill hides with its card, and the text stays open.
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(tools(page)).not.toHaveAttribute('data-visible', '')
    await expect(inlineEditor(page)).toHaveCount(1)
    await page.evaluate((y) => window.scrollTo(0, y), top)
    await expect(tools(page)).toHaveAttribute('data-visible', '')
    await page.locator('[data-plan-block-edit]').tap()
    await expect(page.locator('[data-plan-block-editor="edit"]:not([data-inline])')).toBeVisible()
  })
})
