import { expect, test, type Locator, type Page } from '@playwright/test'
import { useOwnPlanServer } from './fixtures/ownServer.ts'

// Moves blocks and applies the moves. Its own server keeps them off the shared plan.
useOwnPlanServer(9493, 'watch', 'e2e/fixtures/block-move.plan.md')

const grip = (page: Page) => page.locator('[data-plan-block-move]')
const menu = (page: Page) => page.locator('[data-plan-block-move-menu]')
const bar = (page: Page) => page.locator('[data-plan-apply-bar]')
const top = (page: Page) => page.locator('[data-plan-rendered] > [data-plan-block]')
const phase = (page: Page, id: string) => page.locator(`[data-plan-rendered] > [data-entry="phase"][data-entry-id="${id}"]`)
const choice = (page: Page) => top(page).filter({ has: page.locator('[data-entry="choice"]') })

async function openPlan(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('[data-plan-rendered]')).toBeVisible()
  await expect(page.locator('body')).toHaveAttribute('data-plan-editable', 'true')
}

async function planSource(page: Page): Promise<string> {
  return page.evaluate(async () => ((await (await fetch('/api/plan-mdx', { cache: 'no-store' })).json()) as { source: string }).source)
}

/** What the top-level blocks are, in order: a phase or a card by its id, a document block by its kind, text by its first words. */
async function topOrder(page: Page): Promise<string[]> {
  return top(page).evaluateAll((blocks) =>
    blocks.map((block) => {
      const entry = block.closest('[data-entry-id]') ?? block.querySelector('[data-entry-id]')
      const id = entry?.getAttribute('data-entry-id')
      if (id) return `#${id}`
      const kind = block.getAttribute('data-doc-block') ?? (block.querySelector('.vlp-workflow') ? 'workflow' : null)
      return kind ?? (block.textContent ?? '').trim().split(/\s+/).slice(0, 2).join(' ')
    }),
  )
}

/** Point at a block, away from its own controls, so its grip shows. */
async function pointAt(page: Page, block: Locator): Promise<void> {
  await block.scrollIntoViewIfNeeded()
  const box = await block.boundingBox()
  if (!box) throw new Error('the block is not on screen')
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(8, box.height / 2))
  await expect(grip(page)).toHaveAttribute('data-visible', '')
}

/** The grip is level with the block's top and left of it, in the gutter. */
async function expectGripBeside(page: Page, block: Locator): Promise<void> {
  const [handle, box] = [await grip(page).boundingBox(), await block.boundingBox()]
  if (!handle || !box) throw new Error('no grip or block on screen')
  expect(handle.x + handle.width).toBeLessThanOrEqual(box.x)
  expect(handle.y).toBeGreaterThanOrEqual(box.y - 1)
  expect(handle.y).toBeLessThan(box.y + Math.max(box.height, 40))
}

test('text, cards, a locked card, and the blocks in a phase each show a grip; a choice option is part of its card', async ({ page }) => {
  await openPlan(page)
  const intro = top(page).filter({ hasText: 'Every block on this page' })
  await pointAt(page, intro)
  await expectGripBeside(page, intro)

  // A block inside a phase has a grip of its own, and going left to it keeps it.
  const line = phase(page, 'build').locator('[data-plan-block]').filter({ hasText: 'Count rejects' })
  await pointAt(page, line)
  await expectGripBeside(page, line)
  const handle = await grip(page).boundingBox()
  if (!handle) throw new Error('no grip')
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2, { steps: 8 })
  await page.waitForTimeout(400)
  await expect(grip(page)).toHaveAttribute('data-visible', '')
  await expectGripBeside(page, line)

  // A locked phase moves, as a locked card does in the editor; the blocks in it keep their order.
  const locked = phase(page, 'agreed')
  await pointAt(page, locked.locator('[data-plan-block]').filter({ hasText: 'Then to everyone' }))
  await expectGripBeside(page, locked)

  // An option is a part of its choice, not a block: the grip is the choice's.
  await choice(page).getByText('Reject traffic if Redis is down.').hover()
  await expectGripBeside(page, choice(page))
  // So is a row of a file tree.
  const tree = top(page).filter({ hasText: 'Files touched' })
  await tree.getByText('gateway.ts').hover()
  await expectGripBeside(page, tree)
})

test('dragging a grip moves a block out of its phase, the change waits on this device, and Apply changes saves it', async ({ page }) => {
  await openPlan(page)
  const line = phase(page, 'build').locator('[data-plan-block]').filter({ hasText: 'Count rejects' })
  await pointAt(page, line)
  const handle = await grip(page).boundingBox()
  const target = await phase(page, 'agreed').boundingBox()
  if (!handle || !target) throw new Error('no grip or target on screen')

  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + 4, handle.y + 40, { steps: 4 })
  // The block being moved is dimmed, and a line shows where it will go: before the locked phase, as wide as the plan.
  await expect(line).toHaveAttribute('data-plan-moving', '')
  await page.mouse.move(handle.x + 4, target.y - 4, { steps: 12 })
  const drop = page.locator('[data-plan-block-move-line]')
  await expect(drop).toBeVisible()
  const [dropBox, plan] = [await drop.boundingBox(), await page.locator('[data-plan-rendered]').boundingBox()]
  expect(Math.abs((dropBox?.width ?? 0) - (plan?.width ?? 0))).toBeLessThan(2)
  await page.mouse.up()

  await expect(bar(page)).toContainText('1 change not applied')
  await expect.poll(() => topOrder(page)).toEqual(['Block move', 'Every block', '#build', 'Count rejects', '#agreed', '#fail-mode', 'FileTree', 'workflow'])
  await expect(phase(page, 'build')).not.toContainText('Count rejects')
  // Nothing reached the plan yet.
  expect(await planSource(page)).toContain('Wire the limiter into the gateway.\n\nCount rejects per route.')

  await page.locator('[data-plan-apply]').click()
  await expect(bar(page)).toHaveCount(0)
  await expect
    .poll(() => planSource(page))
    .toContain('Wire the limiter into the gateway.\n\n<callout kind="risk" title="Redis">\nRedis can go away.\n</callout>\n</phase>\n\nCount rejects per route.\n\n<phase id="agreed"')
})

test('a drag into a phase puts the block between the blocks there', async ({ page }) => {
  await openPlan(page)
  const intro = top(page).filter({ hasText: 'Every block on this page' })
  await pointAt(page, intro)
  const handle = await grip(page).boundingBox()
  const second = await phase(page, 'build').locator('[data-plan-block]').filter({ hasText: 'Count rejects' }).boundingBox()
  if (!handle || !second) throw new Error('no grip or target on screen')
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + 4, second.y - 4, { steps: 12 })
  await page.mouse.up()

  await expect(bar(page)).toContainText('1 change not applied')
  await expect(phase(page, 'build').locator('[data-plan-block]')).toHaveText([/^Wire the limiter/, /^Every block/, /^Count rejects/, /Redis can go away/])
})

test('the grip menu moves a block up and down, stays open on the block, and putting it back leaves nothing to apply', async ({ page }) => {
  await openPlan(page)
  await pointAt(page, choice(page))
  await grip(page).click()
  await expect(menu(page)).toBeVisible()
  await expect(menu(page).getByRole('menuitem', { name: 'Move up' })).toBeEnabled()

  await menu(page).getByRole('menuitem', { name: 'Move up' }).click()
  await expect.poll(() => topOrder(page)).toEqual(['Block move', 'Every block', '#build', '#fail-mode', '#agreed', 'FileTree', 'workflow'])
  await expect(bar(page)).toContainText('1 change not applied')
  // The menu followed the block, so it can keep going.
  await expect(menu(page)).toBeVisible()
  await expectGripBeside(page, choice(page))

  await menu(page).getByRole('menuitem', { name: 'Move down' }).click()
  await expect.poll(() => topOrder(page)).toEqual(['Block move', 'Every block', '#build', '#agreed', '#fail-mode', 'FileTree', 'workflow'])
  await expect(bar(page)).toHaveCount(0)

  // Escape closes the menu; Alt+Up on the focused grip moves the block too.
  await page.keyboard.press('Escape')
  await expect(menu(page)).toBeHidden()
  await grip(page).focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect.poll(() => topOrder(page)).toEqual(['Block move', 'Every block', '#build', '#fail-mode', '#agreed', 'FileTree', 'workflow'])
  await expect(grip(page)).toBeFocused()
})

test('while an editor is open, there is no grip', async ({ page }) => {
  await openPlan(page)
  const intro = top(page).filter({ hasText: 'Every block on this page' })
  await intro.click()
  await expect(page.locator('[data-plan-block-editor]')).toHaveCount(1)
  await choice(page).hover()
  await page.waitForTimeout(300)
  await expect(grip(page)).not.toHaveAttribute('data-visible', '')
})
