import { expect, test } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { appendFile, readFile, writeFile } from 'node:fs/promises'

// While a run is live the agent edits the plan file. An edit that does not compile is held back,
// so the plan stays readable (still locked), and the next good edit replaces it.

const port = 9484
const origin = `http://127.0.0.1:${port}`

let server: ChildProcess | undefined
let serverLog = ''
let planPath = ''

test.use({ baseURL: origin })

test.beforeAll(async () => {
  server = spawn('bun', ['scripts/e2e-server.ts'], {
    env: { ...process.env, E2E_PORT: String(port), E2E_MODE: 'watch' },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  server.stdout?.on('data', (chunk: Buffer) => {
    serverLog += chunk.toString()
  })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('e2e server did not start')), 30_000)
    const check = () => {
      const match = serverLog.match(/^e2e plan (.+)$/m)
      if (!match?.[1]) return
      planPath = match[1].trim()
      clearTimeout(timer)
      resolve()
    }
    server?.stdout?.on('data', check)
  })
})

test.afterAll(async () => {
  if (!server || server.exitCode != null) return
  server.kill('SIGTERM')
  await once(server, 'exit').catch(() => undefined)
})

test('a plan edit that does not compile during a run keeps the plan on screen', async ({ page }) => {
  const original = await readFile(planPath, 'utf8')
  await page.goto('/#plan')
  await expect(page.locator('[data-plan-rendered]')).toBeVisible()

  const started = await page.request.post('/api/execution/start', { data: { step: 'Build the limiter' } })
  expect(started.ok()).toBe(true)
  await page.getByRole('tab', { name: 'Plan' }).click()
  await expect(page.locator('[data-lock-banner]')).toBeVisible()

  await appendFile(planPath, '\n\n<phase id="half-written" title="Half written" status="active">\nNo closing tag\n')
  await page.waitForTimeout(1000)
  await expect(page.locator('[data-plan-rendered]')).toBeVisible()
  await expect(page.locator('[data-plan-error]')).toHaveCount(0)
  await expect(page.getByText('Half written')).toHaveCount(0)

  // A reload with the broken file on disk still shows the plan.
  await page.reload()
  await page.getByRole('tab', { name: 'Plan' }).click()
  await expect(page.locator('[data-plan-rendered]')).toBeVisible()
  await expect(page.locator('[data-plan-error]')).toHaveCount(0)

  // The agent closes the tag. The page shows the edit.
  await writeFile(planPath, `${original}\n\n<phase id="half-written" title="Half written" status="active">\nClosed now\n</phase>\n`)
  await expect(page.getByText('Closed now')).toBeVisible()

  const stopped = await page.request.post('/api/execution/stop', { data: {} })
  expect(stopped.ok()).toBe(true)
})
