import { expect, test, type Page } from '@playwright/test'
import { useOwnPlanServer } from './fixtures/ownServer.ts'

// Edits and applies the plan, and keeps drafts. Its own server keeps them off the shared plan.
useOwnPlanServer(9486)

/** The plan's first block sits right under the fixed toolbar: 60px bar and 16px of room. */
const PLAN_TOP = 76

const intro = (page: Page) => page.locator('[data-plan-rendered] > p[data-plan-block]').first()
const tools = (page: Page) => page.locator('[data-plan-block-tools]')
const editor = (page: Page) => page.locator('[data-plan-block-editor]')

async function openPlan(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('[data-plan-rendered]')).toBeVisible()
  await expect(page.locator('body')).toHaveAttribute('data-plan-editable', 'true')
}

async function planSource(page: Page): Promise<string> {
  return page.evaluate(async () => ((await (await fetch('/api/plan-mdx', { cache: 'no-store' })).json()) as { source: string }).source)
}

test('the toolbar has no Edit button, and the block under the pointer shows Edit and +', async ({ page }) => {
  await openPlan(page)
  await expect(page.locator('.titlebar [data-plan-edit], .plan-edit-btn')).toHaveCount(0)
  const top = await page.locator('[data-plan-rendered]').evaluate((node) => Math.round(node.getBoundingClientRect().top))
  expect(top).toBe(PLAN_TOP)

  await intro(page).hover()
  await expect(tools(page)).toHaveAttribute('data-visible', '')
  await expect(page.locator('[data-plan-block-edit]')).toHaveAccessibleName('Edit this block')
  await expect(page.locator('[data-plan-block-add]')).toHaveAccessibleName('Add a block below')
  // A form keeps its default lock, so it offers no Edit.
  await page.locator('[data-plan-rendered] [data-entry="form"]').first().hover()
  await expect(tools(page)).not.toHaveAttribute('data-visible', '', { timeout: 2_000 })
})

test('Edit opens the block in its place, Done keeps the change, and Apply changes saves it', async ({ page }) => {
  await openPlan(page)
  const before = await intro(page).innerText()
  await intro(page).hover()
  await page.locator('[data-plan-block-edit]').click()
  const content = page.locator('[data-plan-block-editor="edit"] [contenteditable="true"].plan-editor-content')
  await expect(content).toBeVisible()
  // Only that block turned into an editor; the plan around it is still the plan.
  await expect(editor(page)).toHaveCount(1)
  await expect(page.locator('[data-plan-rendered] h1').first()).toBeVisible()
  await expect(page.locator('[data-plan-rendered] > p[data-plan-block]', { hasText: before.slice(0, 40) })).toHaveCount(0)

  await content.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' Edited on the page.')
  await page.locator('[data-plan-block-done]').click()
  await expect(editor(page)).toHaveCount(0)
  await expect(intro(page)).toContainText('Edited on the page.')
  const bar = page.locator('[data-plan-apply-bar]')
  await expect(bar).toContainText('1 change not applied')
  // Nothing reached the plan yet.
  expect(await planSource(page)).not.toContain('Edited on the page.')

  // The change is kept on this device.
  await page.reload()
  await expect(intro(page)).toContainText('Edited on the page.')
  await expect(bar).toBeVisible()

  await page.locator('[data-plan-apply]').click()
  await expect(bar).toHaveCount(0)
  await expect.poll(() => planSource(page)).toContain('Edited on the page.')
  await expect(intro(page)).toContainText('Edited on the page.')
})

test('+ opens an empty block below with the / hint, and Cancel leaves the plan as it was', async ({ page }) => {
  await openPlan(page)
  await intro(page).hover()
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

test('Add a block at the end, and Remove takes a block out', async ({ page }) => {
  await openPlan(page)
  await page.locator('[data-plan-add-block]').click()
  await expect(page.locator('[data-plan-block-editor="add"]')).toBeVisible()
  await page.keyboard.type('A closing note.')
  await page.locator('[data-plan-block-done]').click()
  await expect(page.locator('[data-plan-rendered] > p', { hasText: 'A closing note.' })).toBeVisible()

  const text = (await intro(page).innerText()).slice(0, 40)
  await intro(page).hover()
  await page.locator('[data-plan-block-edit]').click()
  await page.locator('[data-plan-block-remove]').click()
  await expect(page.locator('[data-plan-block-remove]')).toHaveText('Remove this block?')
  await page.locator('[data-plan-block-remove]').click()
  await expect(editor(page)).toHaveCount(0)
  await expect(page.locator('[data-plan-rendered] p', { hasText: text })).toHaveCount(0)
  await expect(page.locator('[data-plan-apply-bar]')).toContainText('2 changes not applied')

  await page.locator('[data-plan-discard]').click()
  await page.locator('[data-plan-discard]').click()
  await expect(page.locator('[data-plan-apply-bar]')).toHaveCount(0)
  await expect(page.locator('[data-plan-rendered] p', { hasText: text }).first()).toBeVisible()
})

test('E edits the block with focus, and typing an E in a field is just typing', async ({ page }) => {
  await openPlan(page)
  await page.evaluate(() => document.body.append(Object.assign(document.createElement('input'), { id: 'probe' })))
  await page.locator('#probe').press('e')
  await expect(editor(page)).toHaveCount(0)
  await page.evaluate(() => document.getElementById('probe')?.remove())

  const option = page.locator('[data-plan-rendered] [data-entry="choice"]').first().getByRole('radio').first()
  await option.focus()
  await page.keyboard.press('e')
  const open = page.locator('[data-plan-block-editor="edit"]')
  await expect(open).toBeVisible()
  await expect(open.locator('[data-editor-entry="choice"]')).toBeVisible()
  // Nothing typed yet: Escape closes it.
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveCount(0)
})

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 800 } })

  test('a tap on a block shows its Edit', async ({ page }) => {
    await openPlan(page)
    await intro(page).tap()
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
