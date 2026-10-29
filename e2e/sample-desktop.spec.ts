import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

test.describe.configure({ mode: 'serial' })

test('sample plan works on a desktop viewport', async ({ page }) => {
  await page.goto('/')
  const details = page.getByRole('button', { name: 'Plan details' })
  const title = page.locator('#plan-title')
  const summary = page.locator('#plan-card .lede')
  await expect(details).toHaveAttribute('aria-expanded', 'false')
  await expect(title).toBeVisible()
  await expect(title).toHaveText('Rate limiting rollout')
  await expect(summary).toBeHidden()
  await details.click()
  await expect(details).toHaveAttribute('aria-expanded', 'true')
  await expect(title).toBeVisible()
  await expect(summary).toBeVisible()
  await expect(summary).toContainText('Add a sliding-window limiter at the API gateway')
  await expect(page.locator('[data-plan-mode-chip]')).toHaveText('watch')
  await page.keyboard.press('Escape')
  await expect(summary).toBeHidden()
  await expect(title).toBeVisible()

  await test.step('plan text, diagram, code, and diff', async () => {
    await expect(page.getByRole('heading', { name: 'Implement gateway middleware' })).toBeVisible()
    await expect(page.getByText('risk · Redis dependency')).toBeVisible()
    await expect(page.getByText('Middleware behind a flag')).toBeVisible()
    await expect(page.getByRole('img', { name: 'Diagram' }).first()).toBeVisible()
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
    await limits.getByRole('combobox', { name: /Initial rollout percentage/ }).click()
    await page.getByRole('option', { name: '25', exact: true }).click()
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
    const workflow = page.locator('[data-tab-panel="workflow"]')
    await expect(workflow.getByText('Expected workflow')).toBeVisible()
    await expect(workflow.getByText('Confirm limiter design').first()).toBeVisible()
    await workflow.getByRole('button', { name: 'Plan · Confirm limiter design' }).click()
    await expect(page.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#plan-design')).toBeVisible()
  })

  await test.step('settings accent and full width save', async () => {
    await page.getByRole('tab', { name: 'Settings' }).click()
    await page.getByRole('button', { name: 'Sky accent' }).click()
    await expect(page.locator('#theme-accent-hex')).toHaveText('#0369a1')
    await expect(page.locator('html')).toHaveAttribute('data-accent', '#0369a1')
    await expect(page.locator('[data-sonner-toast]')).toHaveText('Accent saved')

    await expect(page.locator('html')).toHaveAttribute('data-layout', 'centered')
    await page.getByLabel('Full width').check()
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'full')
    await expect(page.locator('[data-sonner-toast]')).toHaveText('Full width on')
    await page.getByLabel('Full width').uncheck()
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'centered')
    await expect(page.locator('[data-sonner-toast]')).toHaveText('Centered layout')
  })

  await test.step('settings pierre diff theme accordion', async () => {
    await page.getByRole('tab', { name: 'Settings' }).click()
    const toggle = page.locator('#diffs-theme-toggle')
    await expect(page.locator('#diffs-theme-current')).toHaveText('Pierre')
    await expect(page.locator('[data-accordion]')).not.toHaveAttribute('data-open')
    await toggle.click()
    await expect(page.locator('[data-accordion]')).toHaveAttribute('data-open', '')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await page.getByRole('button', { name: 'Soft theme' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-diffs-theme', 'soft')
    await expect(page.locator('#diffs-theme-current')).toHaveText('Soft')
    await expect(page.locator('[data-sonner-toast]')).toHaveText('Diff theme saved')
  })

  await test.step('comment on a plan part', async () => {
    await page.getByRole('tab', { name: 'Plan' }).click()
    await page.getByRole('button', { name: 'Turn comments on' }).click()
    await expect(page.getByRole('button', { name: 'Turn comments off' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByText('risk · Redis dependency').click()
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
    const liveWorkflow = page.locator('[data-tab-panel="workflow"]')
    await expect(liveWorkflow.getByText('Live workflow')).toBeVisible()
    await expect(liveWorkflow.getByText('Forms locked on Plan tab')).toBeVisible()
    await expect(liveWorkflow.getByText('Implement middleware').first()).toBeVisible()
    await page.getByRole('tab', { name: 'Plan' }).click()
    await expect(page.getByText('Execution is live')).toBeVisible()

    const stopped = page.waitForEvent('load')
    const stopResponse = await page.request.post('/api/execution/stop')
    expect(stopResponse.ok()).toBeTruthy()
    await stopped
    await expect(page.getByText('Execution is live')).toHaveCount(0)
    await page.getByRole('button', { name: 'Plan details' }).click()
    await expect(page.locator('[data-plan-mode-chip]')).toHaveText('watch')
    await page.keyboard.press('Escape')
  })

  await mkdir('/opt/cursor/artifacts', { recursive: true })
  await page.getByRole('tab', { name: 'Plan' }).click()
  await page.screenshot({ path: '/opt/cursor/artifacts/sample-desktop-plan.png', fullPage: true })
  await page.getByRole('tab', { name: 'Workflow' }).click()
  await expect(page.locator('[data-tab-panel="workflow"]').getByText('Confirm limiter design').first()).toBeVisible()
  await page.screenshot({ path: '/opt/cursor/artifacts/sample-desktop-workflow.png' })
})
