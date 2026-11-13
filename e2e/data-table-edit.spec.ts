import { expect, test, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'

// A data table opens as a table (ADR 0040), not as MDXEditor's tree of tags. Its own server, so the
// edits it applies stay off the shared plan. The tests run in order on the same plan file.
const origin = 'http://127.0.0.1:9491'

let server: ChildProcess | undefined
let serverLog = ''

test.use({ baseURL: origin })
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  server = spawn('bun', ['scripts/e2e-server.ts'], {
    env: { ...process.env, E2E_PORT: '9491', E2E_MODE: 'watch', E2E_PLAN: 'e2e/fixtures/data-table.plan.md' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout?.on('data', (chunk: Buffer) => {
    serverLog += chunk.toString()
  })
  server.stderr?.on('data', (chunk: Buffer) => {
    serverLog += chunk.toString()
  })
  const ready = waitForUrl(origin)
  const exited = once(server, 'exit').then(([code]) => {
    throw new Error(`data table server exited ${code}\n${serverLog}`)
  })
  await Promise.race([ready, exited])
})

test.afterAll(async () => {
  if (!server || server.exitCode != null) return
  server.kill('SIGTERM')
  await once(server, 'exit').catch(() => undefined)
})

const OPERATIONS = `<DataTable label="Operations">
<Column id="route" header="Route" search sort />
<Column id="state" header="State" filter sort />
<Column id="owner" header="Owner" />
<Row>
<Cell>GET /health</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
</Row>
<Row>
<Cell>POST /api/keys</Cell>
<Cell value="open"><Pill tone="warning">open</Pill></Cell>
<Cell><Chip>platform</Chip></Cell>
</Row>
</DataTable>`

const editor = (page: Page) => page.locator('[data-plan-block-editor]')
const tableEditor = (page: Page) => editor(page).locator('[data-editor-entry="DataTable"]').first()
const cell = (page: Page, row: number, column: number) =>
  tableEditor(page).locator(`[data-dt-cell="${row}:${column}"] .plan-dt-cell-content`)

async function planSource(page: Page): Promise<string> {
  return page.evaluate(async () => ((await (await fetch('/api/plan-mdx', { cache: 'no-store' })).json()) as { source: string }).source)
}

async function openTable(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-plan-editable', 'true')
  await page.locator('[data-plan-rendered] [data-plan-data-table]').first().hover()
  await page.locator('[data-plan-block-edit]').click()
  await expect(tableEditor(page)).toBeVisible()
}

test('a data table opens as a grid, and Done with no change leaves the plan as it was', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openTable(page)
  const before = await planSource(page)
  expect(before).toContain(OPERATIONS)

  const table = tableEditor(page)
  await expect(table.locator('[data-dt-label]')).toHaveValue('Operations')
  await expect(table.locator('[data-dt-header]')).toHaveCount(3)
  await expect(table.locator('[data-dt-header="2"]')).toHaveValue('Owner')
  await expect(table.locator('tbody tr[data-dt-row]')).toHaveCount(2)
  await expect(cell(page, 1, 0)).toHaveText('POST /api/keys')
  // A pill and a chip in a cell look as they do on the page, not as tags.
  await expect(table.locator('[data-dt-cell="0:1"] .plan-pill[data-tone="success"]')).toHaveText('succeeded')
  await expect(table.locator('[data-dt-cell="0:2"] .plan-chip')).toHaveText('gateway')
  await expect(editor(page).getByText('Column', { exact: true })).toHaveCount(0)
  // A column's flags show on its header.
  await expect(table.locator('[data-dt-column="route"] [data-dt-flag-on]')).toHaveCount(2)

  // Looking around a cell changes nothing either.
  await cell(page, 0, 0).click()
  await table.locator('[data-dt-label]').click()
  await page.locator('[data-plan-block-done]').click()
  await expect(editor(page)).toHaveCount(0)
  await expect(page.locator('[data-plan-apply-bar]')).toHaveCount(0)
  expect(await planSource(page)).toBe(before)
  expect(errors).toEqual([])
})

test('a locked data table shows as it is and cannot be changed', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-plan-rendered] [data-entry="callout"]').getByText('These numbers are signed off.').hover()
  await page.locator('[data-plan-block-edit]').click()
  const locked = editor(page).locator('[data-editor-entry="DataTable"][data-locked="true"]')
  await expect(locked).toBeVisible()
  await expect(locked).toContainText('Locked by the plan')
  await expect(locked.locator('[data-dt-label]')).toBeDisabled()
  await expect(locked.locator('[data-dt-header="0"]')).toBeDisabled()
  await expect(locked.locator('[data-dt-column-menu]')).toBeDisabled()
  await expect(locked.locator('[data-dt-add-row], [data-dt-add-column]')).toHaveCount(0)
  await expect(locked.locator('[data-dt-cell="0:0"] .plan-dt-cell-content')).toHaveAttribute('contenteditable', 'false')
  await expect(locked.locator('[data-dt-cell="0:0"]')).toHaveText('Keep as is')
  await page.locator('[data-plan-block-cancel]').click()
  await expect(editor(page)).toHaveCount(0)
})

test('change a header and a cell, add a row, and Apply changes writes only those lines', async ({ page }) => {
  await openTable(page)
  const table = tableEditor(page)
  await table.locator('[data-dt-header="2"]').fill('Team')

  await cell(page, 0, 0).click()
  await page.keyboard.press('End')
  await page.keyboard.type('z')

  await table.locator('[data-dt-add-row]').click()
  await expect(table.locator('tbody tr[data-dt-row]')).toHaveCount(3)
  // The new row's first cell has the caret. Backspace in an empty cell leaves the table alone.
  await expect(cell(page, 2, 0)).toBeFocused()
  await page.keyboard.press('Backspace')
  await expect(tableEditor(page)).toBeVisible()
  await page.keyboard.type('PATCH /api/keys')

  // Done from the keyboard, with the caret still in the cell: the cell hands its text over first.
  await page.keyboard.press('Control+Enter')
  await expect(editor(page)).toHaveCount(0)
  const rendered = page.locator('[data-plan-rendered] [data-plan-data-table]').first()
  await expect(rendered.locator('thead')).toContainText('Team')
  await expect(rendered).toContainText('GET /healthz')
  await expect(rendered).toContainText('PATCH /api/keys')
  await expect(rendered.locator('.plan-pill[data-tone="success"]')).toHaveText('succeeded')

  await page.locator('[data-plan-apply]').click()
  await expect(page.locator('[data-plan-apply-bar]')).toHaveCount(0)
  await expect.poll(() => planSource(page)).toContain('PATCH /api/keys')
  const saved = await planSource(page)
  expect(saved).toContain(`<DataTable label="Operations">
<Column id="route" header="Route" search sort />
<Column id="state" header="State" filter sort />
<Column id="owner" header="Team" />
<Row>
<Cell>GET /healthz</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
</Row>
<Row>
<Cell>POST /api/keys</Cell>
<Cell value="open"><Pill tone="warning">open</Pill></Cell>
<Cell><Chip>platform</Chip></Cell>
</Row>
<Row>
<Cell>PATCH /api/keys</Cell>
<Cell />
<Cell />
</Row>
</DataTable>`)
  // The locked table and everything else stay as the file had them.
  expect(saved).toContain('<DataTable label="Frozen" locked>\n<Column id="name" header="Name" />')
})

test('a column turns search on, a column goes, and a new one takes its id from its header', async ({ page }) => {
  await openTable(page)
  const table = tableEditor(page)
  await table.locator('[data-dt-column="state"] [data-dt-column-menu]').click()
  const popup = page.locator('[data-dt-column-popup]')
  await expect(popup.locator('[data-dt-flag="filter"]')).toHaveAttribute('aria-pressed', 'true')
  await popup.locator('[data-dt-flag="search"]').click()
  await expect(popup.locator('[data-dt-flag="search"]')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(popup).toHaveCount(0)
  await expect(table.locator('[data-dt-column="state"] [data-dt-flag-on]')).toHaveCount(3)

  await table.locator('[data-dt-column="owner"] [data-dt-column-menu]').click()
  await page.locator('[data-dt-column-popup] [data-dt-remove-column]').click()
  await expect(table.locator('[data-dt-header]')).toHaveCount(2)

  await table.locator('[data-dt-add-column]').click()
  const header = table.locator('[data-dt-header="2"]')
  await expect(header).toBeFocused()
  await page.keyboard.type('Due date')
  await cell(page, 0, 2).click()
  await page.keyboard.type('Friday')

  await page.locator('[data-plan-block-done]').click()
  await expect(editor(page)).toHaveCount(0)
  await page.locator('[data-plan-apply]').click()
  await expect.poll(() => planSource(page)).toContain('id="due-date"')
  expect(await planSource(page)).toContain(`<DataTable label="Operations">
<Column id="route" header="Route" search sort />
<Column id="state" header="State" filter sort search />
<Column id="due-date" header="Due date" />
<Row>
<Cell>GET /healthz</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell>Friday</Cell>
</Row>
<Row>
<Cell>POST /api/keys</Cell>
<Cell value="open"><Pill tone="warning">open</Pill></Cell>
<Cell />
</Row>`)
  // The page reads the new column: State is searched, so the table has a search field.
  await expect(page.locator('[data-plan-rendered] [data-plan-data-table]').first().locator('thead')).toContainText('Due date')
})

test('the / menu adds a data table with two columns and one row', async ({ page }) => {
  await page.goto('/')
  // The tables load after the page; count them once they are there.
  await expect(page.locator('[data-plan-rendered] [data-plan-data-table]')).toHaveCount(2)
  const before = 2
  await page.locator('[data-plan-add-block]').click()
  await expect(page.locator('[data-plan-block-editor="add"]')).toBeVisible()
  // The menu's query stops at a space, so the entry answers to "datatable" too.
  await page.keyboard.type('/datatable')
  await expect(page.locator('.plan-slash-menu [data-slash-card]')).toHaveCount(1)
  await expect(page.locator('.plan-slash-menu [data-slash-card="data-table"]')).toBeVisible()
  await page.keyboard.press('Enter')
  const added = editor(page).locator('[data-editor-entry="DataTable"]')
  await expect(added).toBeVisible()
  await expect(added.locator('[data-dt-header]')).toHaveCount(2)
  await expect(added.locator('tbody tr[data-dt-row]')).toHaveCount(1)
  await page.locator('[data-plan-block-done]').click()
  await expect(editor(page)).toHaveCount(0)
  await expect(page.locator('[data-plan-rendered] [data-plan-data-table]')).toHaveCount(before + 1)
  await expect(page.locator('[data-plan-rendered] [data-plan-data-table]').last()).toContainText('What this row holds.')
})

async function waitForUrl(url: string): Promise<void> {
  const deadline = Date.now() + 30_000
  let last = 'not started'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      last = `${response.status}`
    } catch (error) {
      last = error instanceof Error ? error.message : 'fetch failed'
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for ${url} (${last})\n${serverLog}`)
}
