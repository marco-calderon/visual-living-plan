import { expect, test, type Locator, type Page } from '@playwright/test'
import { appendToText, clickTextAt, inlineEditor, pointAtWord } from './fixtures/inlineEdit.ts'
import { useOwnPlanServer } from './fixtures/ownServer.ts'

// Text and table cells are edited where they read; cards, choices, endpoints, and diagrams keep the
// Edit pill (ADR 0040). Its own server and plan, so the edits it applies stay off the shared plan.
useOwnPlanServer(9492, 'watch', 'e2e/fixtures/inline-edit.plan.md')

const rendered = (page: Page) => page.locator('[data-plan-rendered]')
const tools = (page: Page) => page.locator('[data-plan-block-tools]')
const editor = (page: Page) => page.locator('[data-plan-block-editor]')

async function openPlan(page: Page): Promise<void> {
  await page.goto('/')
  await expect(rendered(page)).toBeVisible()
  await expect(page.locator('body')).toHaveAttribute('data-plan-editable', 'true')
}

async function planSource(page: Page): Promise<string> {
  return page.evaluate(async () => ((await (await fetch('/api/plan-mdx', { cache: 'no-store' })).json()) as { source: string }).source)
}

/** The top of the block after `block`, skipping the plan header's eyebrow and facts. */
function nextTop(block: Locator): Promise<number | undefined> {
  return block.evaluate((node) => {
    let next = node.nextElementSibling
    while (next?.matches('[data-plan-head]')) next = next.nextElementSibling
    return next?.getBoundingClientRect().top
  })
}

test('text keeps its place and look while it is edited, and the caret goes where the click landed', async ({ page }) => {
  await openPlan(page)
  const cases: Array<{ block: Locator; text: Locator; word: string; typed: string }> = [
    { block: rendered(page).locator('> h1'), text: rendered(page).locator('> h1'), word: 'edit', typed: 'Inline @edit' },
    { block: rendered(page).locator('> h2'), text: rendered(page).locator('> h2'), word: 'llout', typed: 'Ro@llout' },
    { block: rendered(page).locator('> ul[data-plan-block]'), text: rendered(page).locator('> ul[data-plan-block] li').nth(1), word: 'on for', typed: 'Turn it @on for staff' },
    { block: rendered(page).locator('> blockquote'), text: rendered(page).locator('> blockquote'), word: 'limiter', typed: 'Keep the old @limiter' },
    { block: rendered(page).locator('[data-entry="phase"] p[data-plan-block]'), text: rendered(page).locator('[data-entry="phase"] p[data-plan-block]'), word: 'tests', typed: 'and its @tests.' },
  ]
  for (const { block, text, word, typed } of cases) {
    const before = await block.boundingBox()
    const after = await nextTop(block)
    await clickTextAt(page, text, word)
    await page.keyboard.type('@')
    await expect(inlineEditor(page)).toContainText(typed)
    // The text and the block under it did not move. The editor adds no line of its own below.
    const box = await inlineEditor(page).locator('.plan-editor-content > *').first().boundingBox()
    expect(Math.abs((box?.y ?? 0) - (before?.y ?? 0)), `${typed} moved`).toBeLessThan(1)
    expect(Math.abs((box?.height ?? 0) - (before?.height ?? 0)), `${typed} changed height`).toBeLessThan(1)
    await expect(inlineEditor(page).locator('.plan-editor-content > *')).toHaveCount(1)
    const below = await inlineEditor(page).evaluate((node) => {
      let next = node.nextElementSibling
      while (next?.matches('[data-plan-head]')) next = next.nextElementSibling
      return next?.getBoundingClientRect().top
    })
    if (after !== undefined) expect(Math.abs((below ?? 0) - after), `the block after ${typed} moved`).toBeLessThan(1)
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Escape')
    await expect(editor(page)).toHaveCount(0)
  }
  // The title keeps its eyebrow and facts while it is open.
  await clickTextAt(page, rendered(page).locator('> h1'), 'edit')
  await expect(rendered(page).locator('[data-plan-head]')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-plan-apply-bar]')).toHaveCount(0)
})

test('a pipe table cell is edited where it is, Enter keeps it, and only that cell changes in the file', async ({ page }) => {
  await openPlan(page)
  const before = await planSource(page)
  const cell = rendered(page).locator('.rich-table tbody tr').nth(1).locator('td').nth(1)
  const box = await cell.boundingBox()
  // No pill on a cell's text; the table's own Edit is for its rows and columns.
  await cell.hover()
  await expect(tools(page)).toHaveAttribute('data-visible', '')

  await clickTextAt(page, cell, 'per minute')
  await expect(editor(page)).toHaveAttribute('data-plan-block-editor', 'cell')
  // The cell keeps its size, and the table stays a table around it.
  const open = await cell.boundingBox()
  expect(Math.abs((open?.height ?? 0) - (box?.height ?? 0))).toBeLessThan(1)
  await expect(rendered(page).locator('.rich-table tbody tr')).toHaveCount(2)
  await page.keyboard.type('a | b ')
  await page.keyboard.press('Enter')
  await expect(editor(page)).toHaveCount(0)
  await expect(cell).toHaveText('600 a | b per minute')

  await page.locator('[data-plan-apply]').click()
  await expect(page.locator('[data-plan-apply-bar]')).toHaveCount(0)
  const after = await planSource(page)
  // The pipe is escaped, so the row keeps two cells. Every other line is as it was.
  expect(after).toContain('| POST /api/keys | 600 a \\| b per minute |')
  const changed = after.split('\n').filter((line, index) => line !== before.split('\n')[index])
  expect(changed).toEqual(['| POST /api/keys | 600 a \\| b per minute |'])
  await expect(cell).toHaveText('600 a | b per minute')
})

test('an empty edit of a header cell changes nothing, and a click outside keeps a cell edit', async ({ page }) => {
  await openPlan(page)
  const header = rendered(page).locator('.rich-table thead th').first()
  await clickTextAt(page, header, 'Route')
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveCount(0)
  await expect(page.locator('[data-plan-apply-bar]')).toHaveCount(0)

  const cell = rendered(page).locator('.rich-table tbody tr').first().locator('td').nth(1)
  await clickTextAt(page, cell, 'none')
  await page.keyboard.press('End')
  await page.keyboard.type(' yet')
  await page.mouse.click(5, 450)
  await expect(editor(page)).toHaveCount(0)
  await expect(cell).toHaveText('none yet')
  await expect(page.locator('[data-plan-apply-bar]')).toContainText('1 change not applied')
})

test("a data table cell opens the table's editor with the caret in that cell", async ({ page }) => {
  await openPlan(page)
  const cell = rendered(page).locator('[data-plan-data-table] tbody tr').nth(1).locator('td').first()
  await cell.scrollIntoViewIfNeeded()
  const point = await pointAtWord(cell, 'imits')
  await page.mouse.click(point.x, point.y)
  const content = editor(page).locator('[data-dt-cell="1:0"] .plan-dt-cell-content')
  await expect(content).toBeFocused()
  await page.keyboard.type('@')
  await expect(content).toHaveText('L@imits')
  await page.locator('[data-plan-block-cancel]').click()
  await expect(editor(page)).toHaveCount(0)
  await expect(page.locator('[data-plan-apply-bar]')).toHaveCount(0)
})

test("components keep the Edit pill, and a choice's option text picks the option", async ({ page }) => {
  await openPlan(page)
  const components = [
    rendered(page).locator('.rich-table'),
    rendered(page).locator('[data-entry="phase"]'),
    rendered(page).locator('[data-entry="choice"]'),
    rendered(page).locator('> .plan-block-frame').first(),
    rendered(page).locator('[data-doc-block="Endpoint"]'),
    rendered(page).locator('[data-plan-data-table]'),
  ]
  for (const component of components) {
    await page.mouse.move(5, 450)
    await expect(tools(page)).not.toHaveAttribute('data-visible', '', { timeout: 2_000 })
    await component.scrollIntoViewIfNeeded()
    await component.hover({ position: { x: 12, y: 12 } })
    await expect(tools(page)).toHaveAttribute('data-visible', '')
  }
  for (const text of [rendered(page).locator('> p[data-plan-block]').first(), rendered(page).locator('> h2'), rendered(page).locator('> ul[data-plan-block]')]) {
    await page.mouse.move(5, 450)
    await text.hover()
    await page.waitForTimeout(400)
    await expect(tools(page)).not.toHaveAttribute('data-visible', '')
  }

  // A click on a choice's option text picks the option; it does not open an editor.
  await rendered(page).locator('[data-entry="choice"]').getByText('Allow traffic.').click()
  await page.waitForTimeout(300)
  await expect(editor(page)).toHaveCount(0)
})

test("text in a card and a card's title are edited where they read, and only their bytes change", async ({ page }) => {
  await openPlan(page)
  const before = await planSource(page)

  // A callout's paragraph opens in its place with the caret where the click landed.
  const note = rendered(page).locator('[data-entry="callout"] p[data-plan-text]')
  await note.scrollIntoViewIfNeeded()
  const box = await note.boundingBox()
  await clickTextAt(page, note, 'week')
  await page.keyboard.type('@')
  await expect(inlineEditor(page)).toContainText('a @week first')
  const open = await inlineEditor(page).locator('.plan-editor-content > *').first().boundingBox()
  expect(Math.abs((open?.y ?? 0) - (box?.y ?? 0))).toBeLessThan(1)
  await page.keyboard.press('Control+Enter')
  await expect(editor(page)).toHaveCount(0)
  await expect(note).toHaveText('Staff get the flag for a @week first.')

  // A phase's title takes the caret where it reads; the click does not jump to the workflow.
  const phaseTitle = rendered(page).locator('[data-entry="phase"] [data-plan-title]')
  await phaseTitle.scrollIntoViewIfNeeded()
  const titleBox = await phaseTitle.boundingBox()
  const point = await pointAtWord(phaseTitle, 'limiter')
  await page.mouse.click(point.x, point.y)
  await expect(phaseTitle).toBeFocused()
  await expect(page.locator('[data-tab-target="plan"]')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.type('new ')
  const editingBox = await phaseTitle.boundingBox()
  expect(Math.abs((editingBox?.y ?? 0) - (titleBox?.y ?? 0))).toBeLessThan(1)
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-plan-title-editing]')).toHaveCount(0)
  await expect(phaseTitle).toHaveText('Build the new limiter')

  // Escape with nothing typed closes a title as it was.
  const calloutTitle = rendered(page).locator('[data-entry="callout"] [data-plan-title]')
  await calloutTitle.click()
  await expect(calloutTitle).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-plan-title-editing]')).toHaveCount(0)
  await expect(page.locator('[data-plan-apply-bar]')).toContainText('2 changes not applied')

  // A choice's prompt, in a card that keeps clicks to itself. A click outside keeps the edit.
  const prompt = rendered(page).locator('[data-entry="choice"] [data-plan-title]')
  await prompt.click()
  await expect(prompt).toBeFocused()
  await page.keyboard.press('End')
  await page.keyboard.type(' "now"')
  await page.mouse.click(5, 450)
  await expect(page.locator('[data-plan-title-editing]')).toHaveCount(0)
  await expect(prompt).toHaveText('If Redis is unreachable, how should the limiter behave? "now"')

  await page.locator('[data-plan-apply]').click()
  await expect(page.locator('[data-plan-apply-bar]')).toHaveCount(0)
  await expect.poll(() => planSource(page)).toContain('Build the new limiter')
  const after = (await planSource(page)).split('\n')
  const changed = after.filter((line, index) => line !== before.split('\n')[index])
  expect(changed).toEqual([
    '<phase id="build" title="Build the new limiter" status="active">',
    '<choice id="mode" prompt="If Redis is unreachable, how should the limiter behave? &quot;now&quot;">',
    'Staff get the flag for a @week first.',
  ])
})

/** Every top the element at `selector` takes, frame by frame, from now until `stop()`. */
async function trackTops(page: Page, selector: string): Promise<() => Promise<number[]>> {
  await page.evaluate((selector) => {
    const tops: number[] = []
    const state = window as unknown as { __tops: number[]; __tracking: boolean }
    state.__tops = tops
    state.__tracking = true
    const tick = () => {
      const top = Math.round(document.querySelector(selector)?.getBoundingClientRect().top ?? -1)
      if (tops[tops.length - 1] !== top) tops.push(top)
      if (state.__tracking) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, selector)
  return () =>
    page.evaluate(() => {
      const state = window as unknown as { __tops: number[]; __tracking: boolean }
      state.__tracking = false
      return state.__tops
    })
}

test('Enter makes a new block with the caret in it, and nothing on the page jumps', async ({ page }) => {
  await openPlan(page)
  const intro = rendered(page).locator('> p[data-plan-block]').first()
  await clickTextAt(page, intro, 'gateway')
  await page.keyboard.press('Control+End')

  // Enter at the end: the text closes as it was, and an empty block opens below it with the caret.
  // The heading under it moves down one line, once: no frame shows it anywhere else.
  const heading = rendered(page).locator('> h2')
  const start = (await heading.boundingBox())?.y ?? 0
  const stop = await trackTops(page, '[data-plan-rendered] > h2')
  await page.keyboard.press('Enter')
  await expect(inlineEditor(page)).toHaveAttribute('data-plan-block-editor', 'add')
  await expect(inlineEditor(page).locator('[contenteditable="true"]')).toBeFocused()
  await page.waitForTimeout(300)
  const down = (await heading.boundingBox())?.y ?? 0
  expect(down).toBeGreaterThan(start + 20)
  expect((await stop()).filter((top) => Math.abs(top - Math.round(start)) > 1 && Math.abs(top - Math.round(down)) > 1)).toEqual([])
  await expect(editor(page)).toHaveCount(1)

  // Enter in the middle: the text after the caret becomes the next block, with the caret at its start.
  await page.keyboard.type('Staff first, then everyone.')
  await page.keyboard.press('Home')
  for (let step = 0; step < 'Staff first, '.length; step += 1) await page.keyboard.press('ArrowRight')
  const tops = await trackTops(page, '[data-plan-rendered] > h2')
  await page.keyboard.press('Enter')
  await expect(inlineEditor(page)).toHaveAttribute('data-plan-block-editor', 'edit')
  await expect(inlineEditor(page)).toHaveText('then everyone.')
  await page.keyboard.type('>')
  await expect(inlineEditor(page)).toHaveText('>then everyone.')
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(300)
  const lower = (await heading.boundingBox())?.y ?? 0
  expect(lower).toBeGreaterThan(down + 20)
  expect((await tops()).filter((top) => Math.abs(top - Math.round(down)) > 1 && Math.abs(top - Math.round(lower)) > 1)).toEqual([])

  // A click outside closes it where it is.
  const open = await inlineEditor(page).boundingBox()
  await page.mouse.click(5, 450)
  await expect(editor(page)).toHaveCount(0)
  const last = rendered(page).locator('> p[data-plan-block]').nth(2)
  await expect(last).toHaveText('then everyone.')
  expect(Math.abs(((await last.boundingBox())?.y ?? 0) - (open?.y ?? 0))).toBeLessThan(1)

  await page.locator('[data-plan-apply]').click()
  await expect(page.locator('[data-plan-apply-bar]')).toHaveCount(0)
  await expect
    .poll(() => planSource(page))
    .toContain('See [the rollout](#rollout).\n\nStaff first,\n\nthen everyone.\n\n## Rollout')
})

test('Backspace in an empty block removes it, and the caret goes to the end of the block above', async ({ page }) => {
  await openPlan(page)
  const before = await planSource(page)
  const intro = rendered(page).locator('> p[data-plan-block]').first()
  await clickTextAt(page, intro, 'gateway')
  await page.keyboard.press('Control+End')
  // An empty new block closes, and the caret is back at the end of the text above.
  await page.keyboard.press('Enter')
  await expect(inlineEditor(page)).toHaveAttribute('data-plan-block-editor', 'add')
  await page.keyboard.press('Backspace')
  await expect(inlineEditor(page)).toHaveAttribute('data-plan-block-editor', 'edit')
  await expect(inlineEditor(page).locator('[contenteditable="true"]')).toBeFocused()
  await page.keyboard.type('@')
  await expect(inlineEditor(page)).toContainText('See the rollout.@')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveCount(0)
  await expect(page.locator('[data-plan-apply-bar]')).toHaveCount(0)

  // A heading emptied, then Backspace: it goes from the page and the file, and the caret goes above.
  await clickTextAt(page, rendered(page).locator('> h2'), 'Rollout')
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await expect(inlineEditor(page)).toHaveText('')
  await page.keyboard.press('Backspace')
  await expect(rendered(page).locator('> h2')).toHaveCount(0)
  await expect(inlineEditor(page)).toContainText('See the rollout.')
  await expect(inlineEditor(page).locator('[contenteditable="true"]')).toBeFocused()
  await page.keyboard.type('!')
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveCount(0)
  await expect(intro).toHaveText(/See the rollout\.!$/)
  await page.locator('[data-plan-apply]').click()
  await expect(page.locator('[data-plan-apply-bar]')).toHaveCount(0)
  await expect.poll(() => planSource(page)).not.toContain('## Rollout')
  expect(await planSource(page)).toBe(before.replace('See [the rollout](#rollout).\n\n## Rollout\n\n', 'See [the rollout](#rollout).!\n\n'))
})

test('Backspace in an empty first block removes it, and the caret goes to the start of the block below', async ({ page }) => {
  await openPlan(page)
  await clickTextAt(page, rendered(page).locator('> h1'), 'edit')
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await expect(rendered(page).locator('> h1')).toHaveCount(0)
  await expect(inlineEditor(page)).toContainText('The gateway keeps one window')
  await expect(inlineEditor(page).locator('[contenteditable="true"]')).toBeFocused()
  await page.keyboard.type('@')
  await expect(inlineEditor(page)).toContainText('@The gateway keeps one window')
})

test('Enter in the text of a card makes a new paragraph in that card', async ({ page }) => {
  await openPlan(page)
  const note = rendered(page).locator('[data-entry="callout"] p[data-plan-text]')
  await clickTextAt(page, note, 'week')
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await expect(inlineEditor(page)).toHaveAttribute('data-plan-block-editor', 'add')
  await page.keyboard.type('Then everyone.')
  await page.keyboard.press('Control+Enter')
  await expect(editor(page)).toHaveCount(0)
  await expect(rendered(page).locator('[data-entry="callout"] p[data-plan-text]')).toHaveText([
    'Staff get the flag for a week first.',
    'Then everyone.',
  ])
})

test('the bar of unapplied changes stays while a block is edited, and Apply keeps the open edit too', async ({ page }) => {
  await openPlan(page)
  const intro = rendered(page).locator('> p[data-plan-block]').first()
  await appendToText(page, intro, 'gateway', ' First.')
  const bar = page.locator('[data-plan-apply-bar]')
  await expect(bar).toContainText('1 change not applied')

  // Another block open: the bar stays where it is, and a press on it does not close the block.
  const quote = rendered(page).locator('> blockquote')
  await clickTextAt(page, quote, 'limiter')
  await expect(bar).toBeVisible()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' Second.')
  await page.locator('[data-plan-apply]').click()
  await expect(editor(page)).toHaveCount(0)
  await expect(bar).toHaveCount(0)
  await expect.poll(() => planSource(page)).toContain('when it is full. See [the rollout](#rollout). First.')
  expect(await planSource(page)).toContain('has run for a week. Second.')
})

test('Discard while a block is edited drops the open edit with the rest', async ({ page }) => {
  await openPlan(page)
  const before = await planSource(page)
  const intro = rendered(page).locator('> p[data-plan-block]').first()
  await appendToText(page, intro, 'gateway', ' First.')
  await clickTextAt(page, rendered(page).locator('> blockquote'), 'limiter')
  await page.keyboard.type('Typed ')
  const discard = page.locator('[data-plan-discard]')
  await discard.click()
  // Asking once does not close the block.
  await expect(discard).toHaveText('Discard changes?')
  await expect(editor(page)).toHaveCount(1)
  await discard.click()
  await expect(editor(page)).toHaveCount(0)
  await expect(page.locator('[data-plan-apply-bar]')).toHaveCount(0)
  await expect(rendered(page).locator('> blockquote')).not.toContainText('Typed')
  expect(await planSource(page)).toBe(before)
})

test("paragraphs in a card's editor are spaced as paragraphs on the page", async ({ page }) => {
  await openPlan(page)
  const pageGap = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.querySelector('[data-plan-rendered] > p[data-plan-block]')!).marginBottom))
  const callout = rendered(page).locator('[data-entry="callout"]')
  await callout.scrollIntoViewIfNeeded()
  await callout.hover({ position: { x: 12, y: 12 } })
  await page.locator('[data-plan-block-edit]').click()
  const body = editor(page).locator('.plan-editor-body [contenteditable]').first()
  await expect(body).toContainText('Staff get the flag')
  const point = await pointAtWord(body, 'first.')
  await page.mouse.click(point.x, point.y)
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Then everyone.')
  const gap = await body.evaluate((node) => {
    const [first, second] = Array.from(node.children)
    return second!.getBoundingClientRect().top - first!.getBoundingClientRect().bottom
  })
  expect(Math.abs(gap - pageGap)).toBeLessThan(1)
  await page.locator('[data-plan-block-cancel]').click()
  await expect(editor(page)).toHaveCount(0)
})

test("a phase's step number still jumps to the workflow while its title is editable", async ({ page }) => {
  await openPlan(page)
  await rendered(page).locator('[data-entry="phase"] a.plan-step-number').click()
  await expect(page.locator('[data-tab-target="workflow"]')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-plan-title-editing]')).toHaveCount(0)
})

test('a link in text keeps its click', async ({ page }) => {
  await openPlan(page)
  const link = rendered(page).locator('> p[data-plan-block] a').first()
  await link.click()
  await page.waitForTimeout(300)
  await expect(editor(page)).toHaveCount(0)
})
