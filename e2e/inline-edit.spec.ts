import { expect, test, type Locator, type Page } from '@playwright/test'
import { appendToText, clickTextAt, inlineEditor, pointAtWord } from './fixtures/inlineEdit.ts'
import { useOwnPlanServer } from './fixtures/ownServer.ts'
import { waitForDiagrams } from './fixtures/codeBlocks.ts'

// Text and table cells are edited where they read; cards, choices, endpoints, and diagrams keep the
// Edit pill (ADR 0040). Its own server and plan, so the edits it applies stay off the shared plan.
useOwnPlanServer(9492, 'watch', 'e2e/fixtures/inline-edit.plan.md')

const rendered = (page: Page) => page.locator('[data-plan-rendered]')
const tools = (page: Page) => page.locator('[data-plan-block-tools]')
const editor = (page: Page) => page.locator('[data-plan-block-editor]')
const addBar = (page: Page) => page.locator('[data-plan-block-add]')

/** Discard asks once; the open editor goes with the rest. */
async function discard(page: Page): Promise<void> {
  await page.locator('[data-plan-discard]').click()
  await page.locator('[data-plan-discard]').click()
}

async function openPlan(page: Page): Promise<void> {
  await page.goto('/')
  await expect(rendered(page)).toBeVisible()
  await expect(page.locator('body')).toHaveAttribute('data-plan-editable', 'true')
  // The specs point at blocks by where they are; the diagram above them settles its height later.
  await waitForDiagrams(page)
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

/** Each inline code chip in `root`: where it is, its size, and the type and padding it is drawn with. */
function codeChips(root: Locator) {
  return root.evaluate((node) =>
    [...node.querySelectorAll('code')].map((code) => {
      const box = code.getBoundingClientRect()
      const style = getComputedStyle(code)
      // The editor draws `<code><span>`: the span takes the chip's type and adds no chip of its own.
      const inner = code.firstElementChild ? getComputedStyle(code.firstElementChild) : style
      return {
        text: code.textContent,
        box: [box.x, box.y, box.width, box.height],
        look: [style.fontFamily, style.fontSize, style.padding, style.borderRadius, style.backgroundColor, inner.fontSize, inner.fontFamily],
        innerPadding: code.firstElementChild ? inner.padding : '0px',
      }
    }),
  )
}

test('inline code keeps its chip while its text is edited: the same place, size, and type', async ({ page }) => {
  await openPlan(page)
  const cases: Array<{ text: Locator; word: string }> = [
    { text: rendered(page).locator('> p[data-plan-block]').first(), word: 'gateway' },
    { text: rendered(page).locator('> ul[data-plan-block] li').first(), word: 'Ship' },
    { text: rendered(page).locator('.rich-table tbody tr').first().locator('td').first(), word: 'GET' },
  ]
  for (const { text, word } of cases) {
    await text.scrollIntoViewIfNeeded()
    const before = await codeChips(text)
    expect(before, `${word} has inline code`).toHaveLength(1)
    await clickTextAt(page, text, word)
    const open = await codeChips(inlineEditor(page))
    expect(open.map(({ text, look, innerPadding }) => ({ text, look, innerPadding }))).toEqual(before.map(({ text, look }) => ({ text, look, innerPadding: '0px' })))
    open[0].box.forEach((value, at) => expect(Math.abs(value - before[0].box[at]), `${word}: the code chip moved or changed size`).toBeLessThan(0.5))
    await page.mouse.click(5, 450)
    await expect(editor(page)).toHaveCount(0)
  }
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
  // The first key counts as a change to apply. Discard drops it, open table and all.
  await expect(page.locator('[data-plan-apply-bar]')).toContainText('1 change not applied')
  await discard(page)
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
  await expect(tools(page)).toHaveAttribute('data-visible', '')
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
  await discard(page)
  await expect(editor(page)).toHaveCount(0)
})

test('text in a phase has + under it, which adds a block below it in the phase without opening the phase', async ({ page }) => {
  await openPlan(page)
  const phase = rendered(page).locator('[data-entry="phase"]')
  const text = phase.locator('p[data-plan-block]')
  await text.hover()
  await expect(addBar(page)).toHaveAttribute('data-visible', '')
  await expect(tools(page)).not.toHaveAttribute('data-visible', '', { timeout: 2_000 })
  // On the way down to the bar the pointer crosses the phase's own space: the bar stays the text's.
  const bar = await addBar(page).boundingBox()
  if (!bar) throw new Error('no bar')
  await page.mouse.move(bar.x + 40, bar.y + bar.height / 2, { steps: 8 })
  await page.waitForTimeout(400)
  expect(await addBar(page).boundingBox()).toEqual(bar)
  await addBar(page).click()
  const added = phase.locator('[data-plan-block-editor="add"]')
  await expect(added).toBeVisible()
  await expect(added).toHaveAttribute('data-inline', '')
  await expect(page.locator('[data-plan-block-editor]')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveCount(0)
})

test('a + bar keeps clear of the blocks above and below it, and the gap under open text shows no bar', async ({ page }) => {
  await openPlan(page)
  /** The bar under `above`, and the room between it and the blocks on either side. */
  const barIn = async (above: Locator, below: Locator) => {
    const [bar, top, bottom] = [await addBar(page).boundingBox(), await above.boundingBox(), await below.boundingBox()]
    if (!bar || !top || !bottom) throw new Error('no bar or blocks on screen')
    const gapMiddle = (top.y + top.height + bottom.y) / 2
    expect(Math.abs(bar.y + bar.height / 2 - gapMiddle), 'the bar is centered on the gap').toBeLessThan(1)
    return { height: bar.height, over: bar.y - (top.y + top.height), under: bottom.y - (bar.y + bar.height) }
  }
  // A heading sits close over its list: the bar is a slim line with no +, clear of both, and takes
  // no clicks past its own edges.
  const heading = rendered(page).locator('> h2')
  await heading.hover()
  await expect(addBar(page)).toHaveAttribute('data-visible', '')
  await expect(addBar(page)).toHaveAttribute('data-tight', '')
  await expect(addBar(page)).toHaveAttribute('data-slim', '')
  await expect(addBar(page).locator('svg')).toBeHidden()
  const slim = await barIn(heading, rendered(page).locator('> h2 + *'))
  expect(slim.height).toBeLessThan(6)
  expect(slim.over).toBeGreaterThanOrEqual(2)
  expect(slim.under).toBeGreaterThanOrEqual(2)
  // Under a table, where there is room, a 10px bar with its +, 3px or more from each block.
  const table = rendered(page).locator('.rich-table')
  await table.hover({ position: { x: 20, y: 10 } })
  await expect(addBar(page)).not.toHaveAttribute('data-tight', '')
  await expect(addBar(page)).not.toHaveAttribute('data-slim', '')
  await expect(addBar(page).locator('svg')).toBeVisible()
  const roomy = await barIn(table, rendered(page).locator('.rich-table + *'))
  expect(roomy.height).toBe(10)
  expect(roomy.over).toBeGreaterThanOrEqual(3)
  expect(roomy.under).toBeGreaterThanOrEqual(3)

  // Text open in its editor: the gap under it is its own, with no bar for the block above it.
  const intro = rendered(page).locator('> p[data-plan-block]').first()
  await clickTextAt(page, intro, 'gateway')
  const open = await inlineEditor(page).boundingBox()
  if (!open) throw new Error('no editor')
  await page.mouse.move(open.x + 100, open.y + open.height + 3)
  await page.waitForTimeout(400)
  await expect(addBar(page)).not.toHaveAttribute('data-visible', '')
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveCount(0)
})

test("a pipe table open in its editor is a card like the page's, with a small red delete inside its top right corner", async ({ page }) => {
  await openPlan(page)
  const table = rendered(page).locator('.rich-table')
  await table.scrollIntoViewIfNeeded()
  const read = await table.boundingBox()
  // Where the table starts in the page, whatever the scroll.
  const readTop = await table.evaluate((node) => node.getBoundingClientRect().top + window.scrollY)
  await table.hover({ position: { x: 20, y: 10 } })
  await page.locator('[data-plan-block-edit]').click()
  const open = editor(page).locator('[class*="_tableEditor_"]')
  await expect(open).toBeVisible()
  const cells = open.locator('tbody > tr:first-child > :is(td, th):not([data-tool-cell]):not([class*="_toolCell_"])')
  const [first, last] = [await cells.first().boundingBox(), await cells.last().boundingBox()]
  if (!read || !first || !last) throw new Error('no table on screen')
  // The card takes the table's own place and width, with no room over it; its handles sit outside it.
  expect(Math.abs(first.x - read.x)).toBeLessThan(1)
  expect(Math.abs(last.x + last.width - (read.x + read.width))).toBeLessThan(1)
  const cardTop = await cells.first().evaluate((node) => node.getBoundingClientRect().top + window.scrollY)
  expect(Math.abs(cardTop - readTop)).toBeLessThan(1)
  const style = await cells.first().evaluate((node) => ({ radius: getComputedStyle(node).borderTopLeftRadius, family: getComputedStyle(node).fontFamily }))
  expect(style.radius).toBe('12px')
  expect(style.family).toContain('DM Sans')
  const remove = open.getByTitle('Delete table')
  await expect(remove).toBeVisible()
  expect(await remove.evaluate((node) => [getComputedStyle(node).color, getComputedStyle(node).opacity])).toEqual(['rgb(239, 77, 62)', '1'])
  const trash = await remove.boundingBox()
  expect(trash && trash.x + trash.width <= last.x + last.width && trash.y >= last.y && trash.y + trash.height <= last.y + last.height).toBe(true)

  // + for a row under the card and + for a column right of it show the whole time, and add them.
  await page.mouse.move(5, 450)
  const addRow = open.locator('[class*="_addRowButton_"]')
  const addColumn = open.locator('[class*="_addColumnButton_"]')
  for (const bar of [addRow, addColumn]) expect(await bar.evaluate((node) => getComputedStyle(node).opacity)).toBe('1')
  const row = await addRow.boundingBox()
  expect(row && row.y >= last.y + last.height).toBe(true)
  const rows = await open.locator(':scope > tbody > tr').count()
  await addRow.click()
  await expect(open.locator(':scope > tbody > tr')).toHaveCount(rows + 1)
  const columns = await cells.count()
  await addColumn.click()
  await expect(cells).toHaveCount(columns + 1)
  // A new, empty column still has room to type in.
  expect((await cells.last().boundingBox())?.width ?? 0).toBeGreaterThan(60)
  await discard(page)
  await expect(editor(page)).toHaveCount(0)
})

test('a block open in its editor has one grip, the page\'s', async ({ page }) => {
  await openPlan(page)
  const phase = rendered(page).locator('[data-entry="phase"]')
  await phase.locator('.plan-title').hover()
  await page.locator('[data-plan-block-edit]').click()
  const open = editor(page)
  await expect(open).toHaveAttribute('data-plan-edit-block', /\d+-\d+/)
  await open.hover({ position: { x: 60, y: 30 } })
  await page.waitForTimeout(300)
  await expect(open.locator(".plan-block-handles[data-level='root']")).toBeHidden()
  await expect(page.locator('[data-plan-block-move]')).toHaveAttribute('data-visible', '')
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveCount(0)
})

test('the / menu adds a chip and a pill inside the text, and filtering does not open it again', async ({ page }) => {
  await openPlan(page)
  const intro = rendered(page).locator('> p[data-plan-block]').first()
  await clickTextAt(page, intro, 'gateway')
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' Owner /')
  const menu = page.locator('.plan-slash-menu')
  await expect(menu).toBeVisible()
  await expect(menu).toHaveAttribute('data-shown', '')
  await page.keyboard.type('ch', { delay: 60 })
  // Still the menu that opened: it does not grow in again.
  await expect(menu.locator('[data-slash-card="chip"]')).toBeVisible()
  expect(await menu.evaluate((node) => node.getAnimations().length)).toBe(0)
  await page.keyboard.type('ip')
  await page.keyboard.press('Enter')
  await expect(inlineEditor(page).locator('[data-editor-label="chip"]')).toHaveText('label')
  // The caret is right after the chip, so the sentence goes on.
  await page.keyboard.type(' /pill')
  await expect(page.locator('.plan-slash-menu [data-slash-card="pill"]')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(inlineEditor(page).locator('[data-editor-label="pill"]')).toHaveText('status')
  await page.keyboard.press('Control+Enter')
  await expect(editor(page)).toHaveCount(0)
  await expect(intro.locator('.plan-chip')).toHaveText('label')
  await expect(intro.locator('.plan-pill')).toHaveText('status')
})

test('text that ends in a /word opens with no / menu, and one Escape closes it', async ({ page }) => {
  await openPlan(page)
  const menu = page.locator('.plan-slash-menu')
  // The intro comes to end in a /word that a card answers to. Typed, it opens the menu.
  const intro = rendered(page).locator('> p[data-plan-block]').first()
  await clickTextAt(page, intro, 'gateway')
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' /health')
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await page.keyboard.press('Control+Enter')
  await expect(editor(page)).toHaveCount(0)
  await expect(intro).toHaveText(/\/health$/)

  // Opened with a click away from the /word, the text shows no menu, and Escape closes the editor.
  const cases: Array<{ text: Locator; word: string }> = [
    { text: intro, word: 'gateway' },
    { text: rendered(page).locator('.rich-table tbody tr').first().locator('td').first(), word: 'GET' },
  ]
  for (const { text, word } of cases) {
    await clickTextAt(page, text, word)
    // The menu would open a moment after the editor does.
    await page.waitForTimeout(300)
    await expect(menu, `${word} opened the / menu`).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(editor(page)).toHaveCount(0)
  }
})

test("a press outside a card's editor closes it, and a click on other text opens that text", async ({ page }) => {
  await openPlan(page)
  const callout = rendered(page).locator('[data-entry="callout"]')
  await callout.scrollIntoViewIfNeeded()
  await callout.hover({ position: { x: 12, y: 12 } })
  await page.locator('[data-plan-block-edit]').click()
  await expect(editor(page)).toHaveAttribute('data-plan-block-editor', 'edit')
  await expect(editor(page)).not.toHaveAttribute('data-inline', '')
  // The card's editor has no Done: a press outside it, on the page's margin too, closes it.
  await page.mouse.click(5, 450)
  await expect(editor(page)).toHaveCount(0)
  await expect(page.locator('[data-plan-apply-bar]')).toHaveCount(0)
  await callout.hover({ position: { x: 12, y: 12 } })
  await page.locator('[data-plan-block-edit]').click()
  await expect(editor(page)).toHaveAttribute('data-plan-block-editor', 'edit')

  const quote = rendered(page).locator('> blockquote')
  await quote.evaluate((node) => node.scrollIntoView({ block: 'center' }))
  const point = await pointAtWord(quote, 'limiter')
  await page.mouse.click(point.x, point.y)
  await expect(inlineEditor(page)).toContainText('Keep the old limiter')
  await expect(inlineEditor(page).locator('[contenteditable="true"]')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveCount(0)
})

test('a tap on another block moves the focus there: text opens, and a card shows its Edit', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:9492', hasTouch: true, viewport: { width: 834, height: 1194 } })
  const page = await context.newPage()
  try {
    await openPlan(page)
    const intro = rendered(page).locator('> p[data-plan-block]').first()
    await intro.tap()
    await expect(inlineEditor(page).locator('[contenteditable="true"]')).toBeFocused()
    // Another paragraph: the open one closes, and the caret goes to the one tapped.
    const quote = rendered(page).locator('> blockquote')
    await quote.tap()
    await expect(inlineEditor(page)).toContainText('Keep the old limiter')
    await expect(inlineEditor(page).locator('[contenteditable="true"]')).toBeFocused()
    // A card: the open text closes, and the card shows its Edit.
    const endpoint = rendered(page).locator('[data-doc-block="Endpoint"]')
    await endpoint.evaluate((node) => node.scrollIntoView({ block: 'center' }))
    const box = await endpoint.boundingBox()
    if (!box) throw new Error('no endpoint on screen')
    await page.touchscreen.tap(box.x + box.width * 0.35, box.y + 12)
    await expect(editor(page)).toHaveCount(0)
    await expect(tools(page)).toHaveAttribute('data-visible', '')
    await expect(page.locator('[data-plan-block-edit]')).toBeVisible()
  } finally {
    await context.close()
  }
})

test("a card's Edit shows beside it while its text is open, and keeps that text's edit", async ({ page }) => {
  await openPlan(page)
  const note = rendered(page).locator('[data-entry="callout"] p[data-plan-text]')
  await clickTextAt(page, note, 'week')
  await expect(tools(page)).toHaveAttribute('data-visible', '')
  // It stays with the card while the pointer goes elsewhere.
  await page.mouse.move(5, 450, { steps: 4 })
  await page.waitForTimeout(400)
  await expect(tools(page)).toHaveAttribute('data-visible', '')
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' Typed.')
  await page.locator('[data-plan-block-edit]').click()
  await expect(page.locator('[data-plan-block-editor="edit"]:not([data-inline])')).toBeVisible()
  await expect(editor(page).locator('.plan-editor-body')).toContainText('Typed.')
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveCount(0)
  await expect(note).toHaveText('Staff get the flag for a week first. Typed.')
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
