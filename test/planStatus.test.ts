import assert from 'node:assert/strict'
import test from 'node:test'
import { createIdleExecutionState, type ExecutionGraph, type ExecutionNodeStatus } from '../src/execution.ts'
import { parsePlan } from '../src/parse.ts'
import { planStatus, workState } from '../src/planStatus.ts'
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

const planned = (...statuses: ExecutionNodeStatus[]): ExecutionGraph => ({
  nodes: statuses.map((status, index) => ({ id: `step-${index}`, label: `Step ${index}`, status })),
})

test('work state reads the workflow step statuses', () => {
  assert.equal(workState(null), 'idle')
  assert.equal(workState({}), 'idle')
  assert.equal(workState({ planned: planned('pending', 'pending') }), 'idle')
  assert.equal(workState({ planned: planned('done', 'pending') }), 'started')
  assert.equal(workState({ planned: planned('blocked', 'pending') }), 'started')
  assert.equal(workState({ planned: planned('done', 'failed') }), 'failed')
  assert.equal(workState({ planned: planned('done', 'done') }), 'completed')
  // A live run moves a planned step forward, as on the Workflow tab.
  const run: ExecutionGraph = { nodes: [{ id: 'step-1', label: 'Step 1', status: 'done' }] }
  assert.equal(workState({ planned: planned('done', 'pending'), graph: run }), 'completed')
  assert.equal(workState({ graph: run }), 'completed')
})

test('plan status: executing, review, stopped, completed, paused, then review', () => {
  assert.equal(planStatus({ mode: 'review', active: true }), 'executing')
  assert.equal(planStatus({ mode: 'watch', active: true, work: 'completed' }), 'executing')

  assert.equal(planStatus({ mode: 'review' }), 'review')
  assert.equal(planStatus({ mode: 'review', decision: 'iterate' }), 'review')
  assert.equal(planStatus({ mode: 'review', work: 'completed' }), 'review')
  assert.equal(planStatus({ mode: 'watch' }), 'review')
  assert.equal(planStatus({ mode: 'comment' }), 'review')

  assert.equal(planStatus({ mode: 'watch', decision: 'deny' }), 'stopped')
  assert.equal(planStatus({ mode: 'watch', decision: 'approve', work: 'failed' }), 'stopped')

  assert.equal(planStatus({ mode: 'watch', decision: 'approve', work: 'completed' }), 'completed')
  assert.equal(planStatus({ mode: 'watch', work: 'completed' }), 'completed')

  assert.equal(planStatus({ mode: 'watch', decision: 'approve' }), 'paused')
  assert.equal(planStatus({ mode: 'watch', work: 'started' }), 'paused')
})

test('the plan page renders the status on the body, the chip dot, and the card', () => {
  const fresh = page()
  assert.match(fresh, /<body[^>]*data-plan-status="review"/)
  assert.match(fresh, /<span class="chip-status" aria-hidden="true"><\/span>/)
  assert.match(fresh, /data-plan-status-label>Review</)

  assert.match(page({ mode: 'review' }), /<body[^>]*data-plan-status="review"/)
  assert.match(page({ mode: 'watch', reviewDecision: 'deny' }), /data-plan-status-label>Stopped</)

  const running = page({ execution: { ...createIdleExecutionState(), active: true } })
  assert.match(running, /<body[^>]*data-plan-status="executing"/)
  assert.match(running, /data-plan-status-label>Executing</)

  const run = (status: ExecutionNodeStatus) => ({
    ...createIdleExecutionState(),
    graph: { nodes: [{ id: 'scope', label: 'Scope', status }] },
  })
  assert.match(page({ execution: run('done') }), /data-plan-status-label>Completed</)
  assert.match(page({ execution: run('active') }), /data-plan-status-label>Paused</)
  assert.match(page({ execution: run('failed') }), /data-plan-status-label>Stopped</)
})
