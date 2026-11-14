import { expect, test, type Locator, type Page } from '@playwright/test'
import { clickTextAt, inlineEditor, pointAtWord } from './fixtures/inlineEdit.ts'
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

test('components keep the Edit pill, and text in them does not open an editor of its own', async ({ page }) => {
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

test('a link in text keeps its click', async ({ page }) => {
  await openPlan(page)
  const link = rendered(page).locator('> p[data-plan-block] a').first()
  await link.click()
  await page.waitForTimeout(300)
  await expect(editor(page)).toHaveCount(0)
})
