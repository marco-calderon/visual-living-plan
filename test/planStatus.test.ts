import assert from 'node:assert/strict'
import test from 'node:test'
import { createIdleExecutionState } from '../src/execution.ts'
import { parsePlan } from '../src/parse.ts'
import { planStatus } from '../src/planStatus.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'

const plan = parsePlan(`---\ntitle: Status\n---\n\n# Scope\n\nText.\n`, 'status.plan.md')

function page(extras: Partial<Parameters<typeof renderPlanPage>[0]> = {}): string {
  return renderPlanPage({
    plan,
    mode: 'watch',
    responses: {},
    diffs: [],
    iteration: 1,
    pendingInteractionIds: [],
    execution: createIdleExecutionState(),
    clientAssets: null,
    theme: themePayload(defaultThemeConfig(), 'live-plan.config.json'),
    ...extras,
  })
}

test('plan status: running wins, then an undecided review, else stopped', () => {
  assert.equal(planStatus({ mode: 'review', active: true }), 'running')
  assert.equal(planStatus({ mode: 'watch', active: true }), 'running')
  assert.equal(planStatus({ mode: 'review' }), 'approval')
  assert.equal(planStatus({ mode: 'review', decision: 'iterate' }), 'stopped')
  assert.equal(planStatus({ mode: 'watch' }), 'stopped')
  assert.equal(planStatus({ mode: 'comment' }), 'stopped')
})

test('the plan page renders the status on the body, the chip dot, and the card', () => {
  const stopped = page()
  assert.match(stopped, /<body[^>]*data-plan-status="stopped"/)
  assert.match(stopped, /<span class="chip-status" aria-hidden="true"><\/span>/)
  assert.match(stopped, /data-plan-status-label>Stopped</)

  assert.match(page({ mode: 'review' }), /<body[^>]*data-plan-status="approval"/)
  assert.match(page({ mode: 'review' }), /data-plan-status-label>Waiting for approval</)

  const running = page({ execution: { ...createIdleExecutionState(), active: true } })
  assert.match(running, /<body[^>]*data-plan-status="running"/)
})
