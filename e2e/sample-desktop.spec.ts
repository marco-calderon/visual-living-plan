import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

test.describe.configure({ mode: 'serial' })

test('sample plan works on a desktop viewport', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Rate limiting rollout', level: 1 })).toBeVisible()
  await expect(page.getByText('Add a sliding-window limiter at the API gateway')).toBeVisible()
  await expect(page.locator('[data-plan-mode-chip]')).toHaveText('watch')

  await test.step('plan text, diagram, code, and diff', async () => {
    await expect(page.getByRole('heading', { name: 'Implement gateway middleware' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Redis dependency' })).toBeVisible()
    await expect(page.getByText('Middleware behind a flag')).toBeVisible()
    await expect(page.locator('.mermaid-diagram svg').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText('export function gate')).toBeVisible()
    await expect(page.getByText('Retry-After').first()).toBeVisible()
  })

  await test.step('plans list without a shared registry', async () => {
    await page.getByRole('button', { name: 'Plans' }).click()
    await expect(page.getByText('Started without the shared registry.')).toBeVisible()
    await page.keyboard.press('Escape')
  })

  await test.step('choice, form, questions, and approval', async () => {
    await page.getByRole('button', { name: /Fail open/ }).click()
    await expect(page.getByText('Selected: Fail open')).toBeVisible()

    const limits = page.locator('form[data-form-id="limits"]')
    await limits.locator('input[name="max_rps"]').fill('80')
    await limits.locator('select[name="rollout"]').selectOption('25')
    await limits.getByRole('button', { name: 'Submit' }).click()
    await expect(page.locator('[data-state-for="limits"]')).toHaveText('Submitted')

    const notes = page.locator('form[data-questions-id="rollout-notes"]')
    await notes.locator('textarea').nth(0).fill('Staging first')
    await notes.locator('textarea').nth(1).fill('Extend the gateway dashboard')
    await notes.getByRole('button', { name: 'Send answers' }).click()
    await expect(page.locator('[data-state-for="rollout-notes"]')).toHaveText('Answers sent')

    const approval = page.locator('[data-interaction-id="proceed-implement"]')
    await approval.locator('textarea').fill('Limits look right')
    await approval.getByRole('button', { name: 'Approve' }).click()
    await expect(approval.locator('[data-state-for="proceed-implement"]')).toHaveText('Approved')
  })

  await test.step('workflow canvas jumps back to the plan', async () => {
    await page.getByRole('tab', { name: 'Workflow' }).click()
    await expect(page.getByText('Expected workflow')).toBeVisible()
    await expect(page.getByText('Confirm limiter design').first()).toBeVisible()
    await page.getByRole('button', { name: 'Plan · Confirm limiter design' }).click()
    await expect(page.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#plan-design')).toBeVisible()
  })

  await test.step('settings accent saves', async () => {
    await page.getByRole('tab', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Sky accent' }).click()
    await expect(page.locator('#theme-accent-hex')).toHaveText('#0369a1')
    await expect(page.locator('html')).toHaveAttribute('data-accent', '#0369a1')
    await expect(page.getByRole('status')).toHaveText('Accent saved')
  })

  await test.step('comment on a plan part', async () => {
    await page.getByRole('tab', { name: 'Plan' }).click()
    await page.getByRole('button', { name: 'Turn comments on' }).click()
    await expect(page.getByRole('button', { name: 'Turn comments off' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('heading', { name: 'Redis dependency' }).click()
    const message = page.getByRole('textbox', { name: 'Message for the agent' })
    await expect(message).toBeVisible()
    await message.fill('Call out the fail-open choice in the runbook')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByText('Call out the fail-open choice in the runbook')).toBeVisible()
    await page.getByRole('button', { name: 'Turn comments off' }).click()
  })

  await test.step('live execution locks the plan, then unlocks', async () => {
    const started = page.waitForEvent('load')
    const startResponse = await page.request.post('/api/execution/start', {
      data: { step: 'Implement middleware', detail: 'Editing gateway.ts' },
    })
    expect(startResponse.ok()).toBeTruthy()
    await started
    await expect(page.getByText('Execution is live')).toBeVisible()
    await expect(page.getByText('Live workflow')).toBeVisible()
    await expect(page.getByText('Implement middleware').first()).toBeVisible()

    const stopped = page.waitForEvent('load')
    const stopResponse = await page.request.post('/api/execution/stop')
    expect(stopResponse.ok()).toBeTruthy()
    await stopped
    await expect(page.getByText('Execution is live')).toHaveCount(0)
    await expect(page.locator('[data-plan-mode-chip]')).toHaveText('watch')
  })

  await mkdir('/opt/cursor/artifacts', { recursive: true })
  await page.getByRole('tab', { name: 'Plan' }).click()
  await page.screenshot({ path: '/opt/cursor/artifacts/sample-desktop-plan.png', fullPage: true })
  await page.getByRole('tab', { name: 'Workflow' }).click()
  await expect(page.getByText('Confirm limiter design').first()).toBeVisible()
  await page.screenshot({ path: '/opt/cursor/artifacts/sample-desktop-workflow.png' })
})
