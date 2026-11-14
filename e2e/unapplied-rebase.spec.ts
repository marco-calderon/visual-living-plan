import { expect, test, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { readFile, writeFile } from 'node:fs/promises'
import { appendToText, clickTextAt } from './fixtures/inlineEdit.ts'

// The agent writes the plan while the person has changes that are not applied yet. The changes
// go on top of the agent's plan (src/planMdx/rebaseDraft.ts); a block both changed waits for the
// person to keep one version.

const port = 9492
const origin = `http://127.0.0.1:${port}`

let server: ChildProcess | undefined
let serverLog = ''
let planPath = ''

test.use({ baseURL: origin })
test.describe.configure({ mode: 'serial' })

// Each test edits the plan file, so each gets a fresh copy of it.
test.beforeEach(async () => {
  serverLog = ''
  planPath = ''
  server = spawn('bun', ['scripts/e2e-server.ts'], {
    env: { ...process.env, E2E_PORT: String(port), E2E_MODE: 'watch' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout?.on('data', (chunk: Buffer) => {
    serverLog += chunk.toString()
  })
  server.stderr?.on('data', (chunk: Buffer) => {
    serverLog += chunk.toString()
  })
  const started = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`e2e server did not start\n${serverLog}`)), 30_000)
    const check = () => {
      const match = serverLog.match(/^e2e plan (.+)$/m)
      if (!match?.[1]) return
      planPath = match[1].trim()
      clearTimeout(timer)
      resolve()
    }
    server?.stdout?.on('data', check)
  })
  const exited = once(server, 'exit').then(([code]) => {
    throw new Error(`e2e server exited ${code}\n${serverLog}`)
  })
  await Promise.race([started, exited])
})

test.afterEach(async () => {
  if (!server || server.exitCode != null) return
  const exited = once(server, 'exit').catch(() => undefined)
  server.kill('SIGTERM')
  await exited
})

const intro = (page: Page) => page.locator('[data-plan-rendered] > p[data-plan-block]').first()
const bar = (page: Page) => page.locator('[data-plan-apply-bar]')

async function savedSource(page: Page): Promise<string> {
  return page.evaluate(async () => ((await (await fetch('/api/plan-mdx', { cache: 'no-store' })).json()) as { source: string }).source)
}

/** The person adds a sentence to the intro and presses Done. Nothing is applied yet. */
async function editIntro(page: Page, text: string): Promise<void> {
  await page.goto('/')
  await expect(page.locator('[data-plan-rendered]')).toBeVisible()
  await expect(page.locator('body')).toHaveAttribute('data-plan-editable', 'true')
  await appendToText(page, intro(page), 'sliding', text)
  await expect(intro(page)).toContainText(text.trim())
  await expect(bar(page)).toContainText('1 change not applied')
}

/** The agent edits the plan file. */
async function agentWrites(change: (source: string) => string): Promise<void> {
  const before = await readFile(planPath, 'utf8')
  const after = change(before)
  expect(after).not.toBe(before)
  await writeFile(planPath, after)
}

test('the agent changes another block: the page shows both, and Apply changes saves both', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await editIntro(page, ' Edited on the page.')

  await agentWrites((source) =>
    source.replace('then alert on sustained 429 spikes.', 'then alert on sustained 429 spikes and Redis errors.'),
  )
  await expect(page.getByText('sustained 429 spikes and Redis errors.')).toBeVisible()
  await expect(intro(page)).toContainText('Edited on the page.')
  await expect(bar(page)).toContainText('1 change not applied')
  await expect(bar(page).locator('[data-plan-apply-note]')).toHaveText('The agent updated the plan. Your changes are kept on top of it.')
  // Nothing reached the plan yet.
  expect(await savedSource(page)).not.toContain('Edited on the page.')

  await expect(page.locator('[data-plan-apply]')).toBeEnabled()
  await page.locator('[data-plan-apply]').click()
  await expect(bar(page)).toHaveCount(0)
  const saved = await savedSource(page)
  expect(saved).toContain('Edited on the page.')
  expect(saved).toContain('sustained 429 spikes and Redis errors.')
  await expect.poll(() => readFile(planPath, 'utf8')).toContain('Edited on the page.')
  expect(await readFile(planPath, 'utf8')).toContain('sustained 429 spikes and Redis errors.')
  expect(errors).toEqual([])
})

test('the agent writes while a block editor is open: Done keeps the edit, then it goes on top of the new plan', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('body')).toHaveAttribute('data-plan-editable', 'true')
  const content = await clickTextAt(page, intro(page), 'sliding')

  await agentWrites((source) =>
    source.replace('then alert on sustained 429 spikes.', 'then alert on sustained 429 spikes and Redis errors.'),
  )
  await expect.poll(() => savedSource(page)).toContain('Redis errors.')
  // The page stays on the file the editor opened on.
  await page.waitForTimeout(500)
  await expect(content).toBeVisible()
  await expect(page.getByText('sustained 429 spikes and Redis errors.')).toHaveCount(0)

  await content.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' Typed while the agent wrote.')
  await page.keyboard.press('Control+Enter')
  // The page checks the edit compiles, then draws it: two compiles of the whole plan.
  await expect(page.locator('[data-plan-block-editor]')).toHaveCount(0, { timeout: 10_000 })
  await expect(page.getByText('sustained 429 spikes and Redis errors.')).toBeVisible()
  await expect(intro(page)).toContainText('Typed while the agent wrote.')
  await expect(bar(page).locator('[data-plan-apply-note]')).toHaveText('The agent updated the plan. Your changes are kept on top of it.')
  await page.locator('[data-plan-apply]').click()
  await expect(bar(page)).toHaveCount(0)
  const saved = await savedSource(page)
  expect(saved).toContain('Typed while the agent wrote.')
  expect(saved).toContain('Redis errors.')
})

test('the agent changes the same paragraph: the bar names the overlap, and Keep mine then Apply saves mine', async ({ page }) => {
  await editIntro(page, ' Mine, from the page.')

  await agentWrites((source) => source.replace("This living plan is the agent's status surface", 'This plan is where the agent reports'))
  await expect(bar(page)).toHaveAttribute('data-plan-conflicts', '1')
  await expect(bar(page)).toContainText("1 of your changes overlaps the agent's")
  const row = bar(page).locator('[data-plan-conflict]')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('We add a sliding-window limiter')
  // The person's line shows what they wrote, not the start the two versions share.
  await expect(row).toContainText('Mine, from the page.')
  await expect(page.locator('[data-plan-apply]')).toBeDisabled()
  // The page shows the agent's version until the person chooses, and editing waits too.
  await expect(intro(page)).toContainText('This plan is where the agent reports')
  await expect(intro(page)).not.toContainText('Mine, from the page.')
  await expect(page.locator('body')).toHaveAttribute('data-plan-editable', 'false')

  // The choice to make survives a reload.
  await page.reload()
  await expect(bar(page)).toHaveAttribute('data-plan-conflicts', '1')

  await bar(page).locator('[data-plan-keep-mine]').click()
  await expect(bar(page)).not.toHaveAttribute('data-plan-conflicts', /.*/)
  await expect(bar(page)).toContainText('1 change not applied')
  await expect(intro(page)).toContainText('Mine, from the page.')
  await expect(intro(page)).not.toContainText('This plan is where the agent reports')
  await expect(page.locator('[data-plan-apply]')).toBeEnabled()

  await page.locator('[data-plan-apply]').click()
  await expect(bar(page)).toHaveCount(0)
  const saved = await savedSource(page)
  expect(saved).toContain('Mine, from the page.')
  expect(saved).not.toContain('This plan is where the agent reports')
  await expect.poll(() => readFile(planPath, 'utf8')).toContain('Mine, from the page.')
})

test('Keep the agent\'s drops the overlapping change and keeps the rest', async ({ page }) => {
  await editIntro(page, ' Mine, from the page.')
  await page.locator('[data-plan-add-block]').click()
  await expect(page.locator('[data-plan-block-editor="add"] [contenteditable="true"].plan-editor-content')).toBeFocused()
  await page.keyboard.type('A closing note from the person.')
  await page.locator('[data-plan-block-done]').click()
  await expect(bar(page)).toContainText('2 changes not applied')

  await agentWrites((source) => source.replace("This living plan is the agent's status surface", 'This plan is where the agent reports'))
  await expect(bar(page)).toHaveAttribute('data-plan-conflicts', '1')
  // The change that does not overlap is already on the page.
  await expect(page.locator('[data-plan-rendered] > p', { hasText: 'A closing note from the person.' })).toBeVisible()

  await bar(page).locator('[data-plan-keep-theirs]').click()
  await expect(bar(page)).toContainText('2 changes not applied')
  await expect(intro(page)).toContainText('This plan is where the agent reports')
  await page.locator('[data-plan-apply]').click()
  await expect(bar(page)).toHaveCount(0)
  const saved = await savedSource(page)
  expect(saved).toContain('This plan is where the agent reports')
  expect(saved).toContain('A closing note from the person.')
  expect(saved).not.toContain('Mine, from the page.')
})
