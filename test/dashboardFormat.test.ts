import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dashboardStatusLine, formatDuration, safeHttpUrl, visiblePlans } from '../src/dashboardFormat.ts'

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
  const summary = { label: 'Today', from: 0, to: 1, plans: 1, started: 1 }
  assert.match(dashboardStatusLine(summary, 1, 'all'), /1 plan active/)
  assert.match(dashboardStatusLine(summary, 0, 'executed'), /showing 0/)
  assert.deepEqual(
    visiblePlans(
      [
        { status: 'running' },
        { status: 'executed' },
      ],
      'running',
    ),
    [{ status: 'running' }],
  )
})
