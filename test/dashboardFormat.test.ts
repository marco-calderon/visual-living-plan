import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  agentLine,
  completionLabel,
  dashboardStatusLine,
  durationPhrase,
  filesText,
  formatDuration,
  outcomeLabel,
  planPlace,
  plansCountText,
  progressDetail,
  questionsText,
  rangeText,
  safeHttpUrl,
  startedText,
  statusLabel,
  statusSegments,
  visiblePlans,
} from '../src/dashboardFormat.ts'
import { renderDashboardPage } from '../src/dashboardPage.ts'

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

test('the status line names the period and its window, and the caption counts the filter', () => {
  const from = new Date(2026, 10, 15, 0, 0).getTime()
  const to = new Date(2026, 10, 15, 21, 24).getTime()
  const line = dashboardStatusLine({ label: 'Today', from, to })
  assert.match(line, /^Today · /)
  // One day is written once.
  assert.equal(line.match(/Nov 15/g)?.length, 1)
  assert.equal(dashboardStatusLine({ label: 'Today', from: 0, to: 0 }), 'Today')
  const week = rangeText(new Date(2026, 10, 9).getTime(), to)
  assert.match(week, /^Nov 9 – Nov 15, /)
  assert.equal(plansCountText(5, 5, 'all'), '5')
  assert.equal(plansCountText(2, 5, 'executed'), '2 of 5')
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

test('the status bar splits the period by status in a fixed order', () => {
  const parts = statusSegments({ active: 1, idle: 1, executed: 2, interrupted: 0 })
  assert.deepEqual(parts.map((part) => part.id), ['active', 'idle', 'executed', 'interrupted'])
  assert.deepEqual(parts.map((part) => part.count), [1, 1, 2, 0])
  assert.deepEqual(parts.map((part) => part.share), [25, 25, 50, 0])
  // A payload saved before idle was counted reads idle as the open plans without an agent.
  assert.equal(statusSegments({ active: 1, running: 3 })[1]?.count, 2)
  assert.deepEqual(statusSegments({}).map((part) => part.share), [0, 0, 0, 0])
  assert.equal(startedText({ plans: 5, started: 3, period: 'week' }), '3 started this week')
  assert.equal(startedText({ plans: 0, started: 0, period: 'day' }), 'No plans today')
})

test('a plan row names its folder, file, progress, verdict, and time', () => {
  assert.deepEqual(planPlace({ directory: '/work/api', planPath: '/work/api/plans/rate.plan.md' }), { folder: 'api', file: 'plans/rate.plan.md' })
  assert.deepEqual(planPlace({ directory: '/work/api/', planPath: '/elsewhere/rate.plan.md' }), { folder: 'api', file: '/elsewhere/rate.plan.md' })
  assert.deepEqual(planPlace({ directory: 'C:\\work\\api', planPath: 'C:\\work\\api\\rate.plan.md' }), { folder: 'api', file: 'rate.plan.md' })
  // A hosted plan has no file.
  assert.deepEqual(planPlace({ directory: '/plans/plan1234/', planPath: '' }), { folder: '', file: '' })
  assert.equal(progressDetail({ phaseDone: 1, phaseTotal: 3, interactionDone: 3, interactionTotal: 4 }), '1/3 phases · 3/4 answers')
  assert.equal(progressDetail({ phaseDone: 0, phaseTotal: 2, interactionTotal: 0 }), '0/2 phases')
  assert.equal(progressDetail({}), 'No phases or questions')
  assert.equal(outcomeLabel('approve'), 'Approved')
  assert.equal(outcomeLabel('deny'), 'Denied')
  assert.equal(outcomeLabel('iterate'), 'Iterate requested')
  assert.equal(outcomeLabel(null), '')
  assert.equal(questionsText(1), '1 question waiting')
  assert.equal(questionsText(3), '3 questions waiting')
  assert.equal(durationPhrase('running', '52m'), 'Open for 52m')
  assert.equal(durationPhrase('executed', '3h 12m'), 'Ran for 3h 12m')
  assert.equal(durationPhrase('interrupted', '48m'), 'Stopped after 48m')
  assert.equal(filesText(1), '1 file changed')
  assert.equal(filesText(6), '6 files changed')
  // Completion that has not started does not read like an Idle row.
  assert.equal(completionLabel('idle'), 'Not started')
  assert.equal(completionLabel('unknown'), 'Not started')
})

test('the local dashboard inlines the shared row helpers and groups its summary in three cards', () => {
  const html = renderDashboardPage()
  for (const name of ['openQuestions', 'statusSegments', 'planPlace', 'progressDetail', 'outcomeLabel', 'rangeText', 'progressTone']) {
    assert.match(html, new RegExp(`const ${name} = \\(function`), name)
  }
  assert.match(html, /<section class="dash-overview" id="stats"/)
  assert.match(html, /<th scope="col">Progress<\/th>/)
  assert.match(html, /class="lede dash-footnote"/)
})
