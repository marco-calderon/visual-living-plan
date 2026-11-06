import assert from 'node:assert/strict'
import { test } from 'node:test'
import { agentLine, dashboardStatusLine, formatDuration, safeHttpUrl, statusLabel, visiblePlans } from '../src/dashboardFormat.ts'

test('duration labels stay short', () => {
  assert.equal(formatDuration(0), '0s')
  assert.equal(formatDuration(59_500), '1m')
  assert.equal(formatDuration(3_600_000), '1h 0m')
  assert.equal(formatDuration(50 * 3_600_000), '2d 2h')
})

test('open links stay on http', () => {
  assert.equal(safeHttpUrl('https://plans.example/plans/a'), 'https://plans.example/plans/a')
  assert.equal(safeHttpUrl('javascript:alert(1)'), '')
  assert.equal(safeHttpUrl(''), '')
})

test('status line counts the period and the active filter', () => {
  const summary = { label: 'Today', from: 0, to: 1, plans: 1, started: 1, active: 1 }
  assert.match(dashboardStatusLine(summary, 1, 'all'), /1 plan\. 1 with an agent connected/)
  assert.match(dashboardStatusLine(summary, 0, 'executed'), /showing 0/)
  const plans = [
    { status: 'running', agentConnected: true },
    { status: 'running', agentConnected: false },
    { status: 'running' },
    { status: 'executed' },
  ]
  assert.deepEqual(visiblePlans(plans, 'active'), [{ status: 'running', agentConnected: true }])
  assert.deepEqual(visiblePlans(plans, 'idle'), [{ status: 'running', agentConnected: false }, { status: 'running' }])
})

test('an open plan reads Active only while an agent is connected', () => {
  const now = 10 * 60_000
  assert.equal(statusLabel({ status: 'running', agentConnected: true }), 'Active')
  assert.equal(statusLabel({ status: 'running', agentConnected: false }), 'Idle')
  assert.equal(statusLabel({ status: 'running' }), 'Idle')
  assert.equal(statusLabel({ status: 'executed', agentConnected: true }), 'Executed')
  assert.equal(statusLabel({ status: 'interrupted' }), 'Interrupted')
  assert.equal(agentLine({ status: 'running', agentConnected: true }, now), 'Agent connected')
  assert.equal(agentLine({ status: 'running', agentConnected: false, agentSeenAt: now - 5 * 60_000 }, now), 'No agent connected · last seen 5m ago')
  assert.equal(agentLine({ status: 'running', agentConnected: false, agentSeenAt: null }, now), 'No agent connected')
  assert.equal(agentLine({ status: 'executed', agentConnected: false }, now), '')
})
