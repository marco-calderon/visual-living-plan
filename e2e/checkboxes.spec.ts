import { expect, test } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'

const origin = 'http://127.0.0.1:9484'

let server: ChildProcess | undefined
let serverLog = ''

test.use({ baseURL: origin })
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  server = spawn('bun', ['scripts/e2e-server.ts'], {
    env: { ...process.env, E2E_PORT: '9484', E2E_MODE: 'watch', E2E_PLAN: 'e2e/fixtures/checkboxes.plan.md' },
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
    throw new Error(`checkbox server exited ${code}\n${serverLog}`)
  })
  await Promise.race([ready, exited])
})

test.afterAll(async () => {
  if (!server || server.exitCode != null) return
  server.kill('SIGTERM')
  await once(server, 'exit').catch(() => undefined)
})

test('a markdown task list shows checkboxes, not [ ] and [x]', async ({ page }) => {
  await page.goto('/')
  const list = page.locator('[data-plan-rendered] .contains-task-list').first()
  await expect(list).toBeVisible()
  await expect(list).not.toContainText('[ ]')
  await expect(list).not.toContainText('[x]')

  const boxes = list.getByRole('checkbox')
  await expect(boxes).toHaveCount(2)
  await expect(boxes.nth(0)).toHaveAttribute('aria-checked', 'false')
  await expect(boxes.nth(1)).toHaveAttribute('aria-checked', 'true')
  await expect(list.locator('.task-list-item').nth(0)).toHaveText('Write the migration')
})

// The documented checklist puts each `<item>` on one line. The editor used to throw on those and show nothing.
test('the editor opens a checklist written one item per line, and Done saves', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()

  const done = page.locator('[data-editor-entry="item"]').getByRole('checkbox', { name: 'Done' })
  await expect(done).toHaveCount(2)
  await expect(done.nth(0)).toBeChecked()
  await expect(done.nth(1)).not.toBeChecked()
  await expect(page.locator('[data-editor-entry="item"]').nth(1)).toContainText('Migration merged')
  expect(errors).toEqual([])

  await done.nth(1).check()
  await page.getByRole('button', { name: 'Publish', exact: true }).click()

  const planPath = serverLog.match(/^e2e plan (.+)$/m)?.[1]?.trim() ?? ''
  expect(planPath).not.toBe('')
  await expect.poll(() => readFile(planPath, 'utf8')).toContain('<item done="true">Migration merged</item>')
  const saved = await readFile(planPath, 'utf8')
  expect(saved).toContain('<item done="true">Schema reviewed</item>')
  expect(saved).toContain('- [ ] Write the migration')
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
