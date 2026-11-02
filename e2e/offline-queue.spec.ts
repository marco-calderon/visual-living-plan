import { expect, test, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { appendFile } from 'node:fs/promises'

// A person with no network: the page opens from the shell cache, the first answer and a
// comment on a plan part are queued, both are recorded once on reconnect, and a write
// queued before an agent edit is refused.

const origin = 'http://127.0.0.1:9481'
const promptPart = 'choice:fail-mode/prompt'

type OfflineWindow = Window & {
  __livingPlanOffline?: {
    available?: boolean
    plan?: (id: string) => { source?: string; revision?: number } | undefined
  }
}

let server: ChildProcess | undefined
let serverLog = ''
let planPath = ''

test.use({ baseURL: origin })
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  server = spawn('bun', ['scripts/e2e-server.ts'], {
    env: { ...process.env, E2E_PORT: '9481', E2E_MODE: 'watch' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout?.on('data', (chunk: Buffer) => {
    serverLog += chunk.toString()
  })
  server.stderr?.on('data', (chunk: Buffer) => {
    serverLog += chunk.toString()
  })
  const exited = once(server, 'exit').then(([code]) => {
    throw new Error(`offline queue server exited ${code}\n${serverLog}`)
  })
  await Promise.race([waitForUrl(origin), exited])
  planPath = serverLog.match(/^e2e plan (.+)$/m)?.[1]?.trim() ?? ''
  expect(planPath).not.toBe('')
})

test.afterAll(async () => {
  if (!server || server.exitCode != null) return
  server.kill('SIGTERM')
  await once(server, 'exit').catch(() => undefined)
})

test('offline answers and part comments queue, sync once, and an agent edit wins', async ({ page, context }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')
  const opfs = await page.evaluate(async () => {
    try {
      await navigator.storage.getDirectory()
      return true
    } catch {
      return false
    }
  })
  test.skip(!opfs, 'Chromium has no OPFS')
  await page.waitForFunction(() => Boolean((window as OfflineWindow).__livingPlanOffline?.plan?.('local')?.source))
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller))
  await page.waitForFunction(() => Boolean((window as OfflineWindow).__livingPlanOffline?.plan?.('local')?.source))
  await page.getByRole('tab', { name: 'Plan' }).click()

  // Online writes are not reported as failures.
  await page.getByRole('button', { name: 'Turn comments on' }).click()
  await expect(page.getByRole('button', { name: 'Turn comments off' })).toBeVisible()
  await page.getByRole('button', { name: 'Turn comments off' }).click()
  await expect(page.getByRole('button', { name: 'Turn comments on' })).toBeVisible()
  await page.waitForTimeout(1_000)
  await expect(badge(page)).toBeHidden()

  await context.setOffline(true)
  await page.reload()
  await page.getByRole('tab', { name: 'Plan' }).click()
  await expect(page.locator('[data-entry-id="fail-mode"]')).toBeVisible()
  await expect(badge(page)).toHaveText('Offline')

  // The first answer this page makes, with no network.
  await page.locator('label[data-choice-id="fail-mode"][data-option-id="open"]').click()
  await expect(badge(page)).toContainText('1 pending')

  await page.getByRole('button', { name: 'Turn comments on' }).click()
  await expect(badge(page)).toContainText('2 pending')
  await page.locator(`[data-plan-part="${promptPart}"]`).click()
  const message = page.getByRole('textbox', { name: 'Message for the agent' })
  await message.fill('Fail open, but alert.')
  await message.locator('xpath=ancestor::form[1]').getByRole('button', { name: 'Send', exact: true }).click()
  await expect(badge(page)).toContainText('3 pending')
  await page.keyboard.press('Escape')

  // Still offline: the cached page keeps the device's comment mode and the queue.
  await page.reload()
  await page.getByRole('tab', { name: 'Plan' }).click()
  await expect(page.getByRole('button', { name: 'Turn comments off' })).toBeVisible()
  await expect(badge(page)).toContainText('3 pending')

  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect
    .poll(async () => {
      const plan = await planJson()
      const answered = plan.responses?.['fail-mode']?.optionId === 'open'
      const commented = (plan.comments ?? []).some((comment) => comment.partId === promptPart && comment.text === 'Fail open, but alert.')
      return answered && commented
    }, { timeout: 30_000 })
    .toBe(true)
  await expect(badge(page)).toBeHidden()
  expect(await pendingCounts(page)).toEqual({ interaction: 1, comment: 1 })

  await page.reload()
  await page.waitForTimeout(2_000)
  expect(await pendingCounts(page)).toEqual({ interaction: 1, comment: 1 })

  // Queued against revision N, the agent publishes N+1, the write is refused.
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller))
  await page.getByRole('tab', { name: 'Plan' }).click()
  await page.getByRole('button', { name: 'Turn comments off' }).click()
  await expect(page.getByRole('button', { name: 'Turn comments on' })).toBeVisible()
  await page.waitForTimeout(1_000)
  await expect(badge(page)).toBeHidden()
  const before = (await snapshotJson()).revision
  await context.setOffline(true)
  await page.getByRole('button', { name: 'Submit', exact: true }).first().click()
  await expect(badge(page)).toContainText('1 pending')
  await appendFile(planPath, '\n\nAgent edit while the reviewer was offline.\n')
  await expect.poll(async () => (await snapshotJson()).revision, { timeout: 10_000 }).toBeGreaterThan(before)
  await context.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(badge(page)).toContainText('1 failed', { timeout: 30_000 })
  expect((await planJson()).responses?.limits).toBeUndefined()

  expect(errors.filter((message) => !/Failed to fetch/.test(message))).toEqual([])
})

function badge(page: Page) {
  return page.locator('[data-offline-state]').first()
}

async function planJson(): Promise<{
  responses?: Record<string, { optionId?: string } | undefined>
  comments?: Array<{ partId?: string; text?: string }>
}> {
  return (await (await fetch(`${origin}/api/plan`)).json()) as never
}

async function snapshotJson(): Promise<{ revision: number }> {
  return (await (await fetch(`${origin}/api/snapshot`)).json()) as { revision: number }
}

async function pendingCounts(page: Page): Promise<{ interaction: number; comment: number }> {
  return page.evaluate(async () => {
    return await new Promise<{ interaction: number; comment: number }>((resolve, reject) => {
      const source = new EventSource('/api/agent-events')
      const timer = window.setTimeout(() => {
        source.close()
        reject(new Error('No hello frame'))
      }, 5_000)
      source.addEventListener('hello', (event) => {
        window.clearTimeout(timer)
        source.close()
        const data = JSON.parse((event as MessageEvent).data) as { pending?: Array<{ event?: string }> }
        const pending = data.pending ?? []
        resolve({
          interaction: pending.filter((item) => item.event === 'interaction').length,
          comment: pending.filter((item) => item.event === 'comment').length,
        })
      })
    })
  })
}

async function waitForUrl(url: string): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}`)
}
