import { expect, test, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'

const origin = 'http://127.0.0.1:9480'
const markdownCell = 'markdown:0/cell:4'
const paragraph = 'markdown:0/paragraph:1'
const gatewayCell = 'phase:owners/cell:dt1.row-1.name'
const stateHeader = 'phase:owners/cell:dt1.header.state'

let server: ChildProcess | undefined
let serverLog = ''

test.use({ baseURL: origin })
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  server = spawn('bun', ['scripts/e2e-server.ts'], {
    env: {
      ...process.env,
      E2E_PORT: '9480',
      E2E_MODE: 'watch',
      E2E_PLAN: 'e2e/fixtures/cell-comments.plan.md',
    },
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
    throw new Error(`cell comment server exited ${code}\n${serverLog}`)
  })
  await Promise.race([ready, exited])
})

test.afterAll(async () => {
  if (!server || server.exitCode != null) return
  server.kill('SIGTERM')
  await once(server, 'exit').catch(() => undefined)
})

test('a reviewer can comment on one markdown cell and one data table cell', async ({ page }) => {
  test.setTimeout(60_000)
  const errors: string[] = []
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Plan' }).click()
  const waiting = page.locator(`[data-plan-part="${markdownCell}"]`)
  const gateway = page.locator(`[data-plan-part="${gatewayCell}"]`)
  await expect(waiting).toHaveText('Waiting')
  await expect(gateway).toHaveText('Gateway')
  await expect(page.locator(`[data-plan-part="${paragraph}"]`)).toHaveText('A paragraph stays selectable.')

  await page.getByRole('button', { name: 'Turn comments on' }).click()
  await expect(page.getByRole('button', { name: 'Turn comments off' })).toBeVisible()

  await commentOn(page, waiting, {
    partId: markdownCell,
    kind: 'cell',
    text: 'Say what Waiting means.',
  })
  await expect(page.locator('.plan-grab-label')).toContainText('cell')
  await expect(page.locator('.plan-grab-label')).toContainText('Waiting')

  await page.keyboard.press('Escape')
  await commentOn(page, page.locator(`[data-plan-part="${paragraph}"]`), {
    partId: paragraph,
    kind: 'paragraph',
    text: 'Leave this paragraph selectable.',
  })
  await expect(page.locator('.plan-grab-label')).toContainText('paragraph')

  await page.keyboard.press('Escape')
  await commentOn(page, gateway, {
    partId: gatewayCell,
    kind: 'cell',
    text: 'Gateway needs a shorter name.',
  })
  await page.keyboard.press('Escape')
  await commentOn(page, page.locator(`[data-plan-part="${stateHeader}"]`), {
    partId: stateHeader,
    kind: 'cell',
    text: 'State is the column to comment on.',
  })

  await page.keyboard.press('Escape')
  const sort = page.getByRole('button', { name: 'Sort by Name' })
  await sort.click()
  await sort.click()
  await expect(page.locator('.plan-data-table tbody tr').first()).toHaveAttribute('data-row', 'row-2')
  await expect(gateway).toHaveAttribute('data-plan-part', gatewayCell)
  await expect(gateway).toHaveText('Gateway')

  const box = await gateway.boundingBox()
  expect(box).not.toBeNull()
  const marks = await page.locator('.plan-grab-mark').all()
  const nearGateway = await Promise.all(
    marks.map(async (mark) => {
      const markBox = await mark.boundingBox()
      if (!box || !markBox) return false
      return Math.abs(markBox.x - (box.x + box.width - 8)) < 28 && Math.abs(markBox.y - (box.y - 8)) < 28
    }),
  )
  expect(nearGateway.some(Boolean)).toBe(true)

  await page.getByRole('searchbox', { name: 'Search rows' }).fill('zzz')
  const empty = page.locator('.plan-data-table-empty')
  await expect(empty).toHaveText('No matching rows.')
  await expect(empty).not.toHaveAttribute('data-plan-part', /.*/)
  expect(errors).toEqual([])
})

async function commentOn(
  page: Page,
  target: ReturnType<Page['locator']>,
  expected: { partId: string; kind: string; text: string },
): Promise<void> {
  const posted = page.waitForRequest(
    (request) => request.url().includes('/api/comments') && request.method() === 'POST',
  )
  await target.click()
  await page.getByRole('textbox', { name: 'Message for the agent' }).fill(expected.text)
  await page.getByRole('button', { name: 'Send' }).click()
  const body = (await posted).postDataJSON() as { partId?: string; kind?: string; text?: string }
  expect(body).toMatchObject(expected)
  await expect(page.getByText(expected.text)).toBeVisible()
}

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
