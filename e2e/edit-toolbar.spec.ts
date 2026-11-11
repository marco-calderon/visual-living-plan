import { expect, test, type Page } from '@playwright/test'
import { useOwnPlanServer } from './fixtures/ownServer.ts'

// Opens the editor, so it writes drafts. Its own server keeps them off the shared plan's origin.
useOwnPlanServer(9486)

/** The plan's first block sits right under the fixed toolbar: 60px bar and 16px of room. */
const PLAN_TOP = 76

function editButton(page: Page) {
  return page.locator('.titlebar [data-plan-edit]')
}

async function openPlan(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('[data-plan-rendered]')).toBeVisible()
  await expect(editButton(page)).toBeVisible()
}

test('Edit sits in the toolbar and turns editing on and off', async ({ page }) => {
  await openPlan(page)
  const edit = editButton(page)
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(1)
  await expect(edit).toHaveAttribute('aria-pressed', 'false')
  await expect(edit).toHaveAttribute('title', 'Edit this plan (E)')
  // Nothing sits between the toolbar and the plan any more.
  const top = await page.locator('[data-plan-rendered]').evaluate((node) => Math.round(node.getBoundingClientRect().top))
  expect(top).toBe(PLAN_TOP)

  await edit.click()
  await expect(page.locator('.plan-editor-content').first()).toBeVisible()
  await expect(edit).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-plan-rendered]')).toBeHidden()

  // Pressed again, it is the editor's Close.
  await edit.click()
  await expect(page.locator('[data-plan-rendered]')).toBeVisible()
  await expect(page.locator('.plan-editor')).toHaveCount(0)
  await expect(edit).toHaveAttribute('aria-pressed', 'false')
})

test('E opens the editor where the reader is, and from Workflow shows the plan', async ({ page }) => {
  await openPlan(page)
  const title = 'If Redis is unreachable, how should the limiter behave?'
  // Typing an E into a field is just typing. (First: focusing the field scrolls the page to it.)
  await page.evaluate(() => document.body.append(Object.assign(document.createElement('input'), { id: 'probe' })))
  await page.locator('#probe').press('e')
  await expect(page.locator('.plan-editor')).toHaveCount(0)
  await page.evaluate(() => document.getElementById('probe')?.remove())

  // Where a contents link puts a section: just under the toolbar.
  await page.getByRole('heading', { name: title }).evaluate((heading, top) => {
    window.scrollTo({ top: heading.getBoundingClientRect().top + window.scrollY - top })
  }, PLAN_TOP)


  await page.keyboard.press('e')
  // The card's title field lands under the editor's sticky bar, not at the top of the plan.
  const fieldTop = () =>
    page.evaluate((text) => {
      const field = [...document.querySelectorAll<HTMLInputElement>('.plan-editor input')].find((node) => node.value === text)
      return field ? Math.round(field.getBoundingClientRect().top) : null
    }, title)
  await expect.poll(fieldTop, { timeout: 10_000 }).not.toBeNull()
  await expect.poll(async () => (await fieldTop()) ?? Number.POSITIVE_INFINITY, { timeout: 10_000 }).toBeLessThan(260)
  await expect.poll(async () => (await fieldTop()) ?? 0, { timeout: 10_000 }).toBeGreaterThan(PLAN_TOP)

  await page.locator('[data-plan-editor-close]').click()
  await expect(page.locator('[data-plan-rendered]')).toBeVisible()
  await page.locator('[data-tab-target="workflow"]').click()
  await expect(page.locator('[data-tab-target="workflow"]')).toHaveAttribute('aria-selected', 'true')
  await editButton(page).click()
  await expect(page.locator('.plan-editor-content').first()).toBeVisible()
  await expect(page.locator('[data-tab-target="plan"]')).toHaveAttribute('aria-selected', 'true')
})

test('a kept draft reads Resume draft, and a phone keeps it as a pencil with a dot', async ({ page }) => {
  await openPlan(page)
  await editButton(page).click()
  const heading = page.locator('.plan-editor-content h1').first()
  await heading.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' draft')
  await expect(page.locator('.plan-editor-status-text')).not.toContainText('No changes yet')
  await page.locator('[data-plan-editor-close]').click()
  await expect(page.getByRole('button', { name: 'Resume draft', exact: true })).toBeVisible()
  await expect(editButton(page)).toHaveAttribute('data-plan-has-draft', '')

  await page.setViewportSize({ width: 390, height: 800 })
  const edit = editButton(page)
  await expect(page.getByRole('button', { name: 'Resume draft', exact: true })).toHaveCount(1)
  const size = await edit.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return { width: Math.round(rect.width), height: Math.round(rect.height) }
  })
  expect(size).toEqual({ width: 36, height: 36 })
  expect(await edit.evaluate((node) => getComputedStyle(node, '::after').content)).not.toBe('none')
  // Every control still fits on the bar. The offline note is left out: it shows only without a network.
  const right = await page.evaluate(() =>
    Math.max(
      ...[...document.querySelectorAll('.titlebar .chrome-tools > :not(.offline-state)')]
        .filter((node) => getComputedStyle(node).display !== 'none')
        .map((node) => node.getBoundingClientRect().right),
    ),
  )
  expect(right).toBeLessThanOrEqual(390)
})
