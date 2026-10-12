import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { registerHostedPlan, closeHostedPlan } from '../src/registryClient.ts'
import { startRegistryServer } from '../src/registryService.ts'
import { emptyGitSnapshot, type PlanRecord } from '../src/processRecord.ts'
import {
  dashboardStatusLine,
  formatDuration,
  orderPlans,
  presentPlans,
} from '../src/tui/dashboardView.ts'
import { readDashboard } from '../src/tui/readDashboard.ts'
import { parseTuiArgs } from '../src/tui/runTui.ts'

const planPath = resolve('examples/rate-limit.plan.md')

function plan(overrides: Partial<PlanRecord> = {}): PlanRecord {
  const now = Date.now()
  return {
    id: '11111111-1111-4111-8111-111111111111',
    pid: 1,
    title: 'Rate limiting rollout',
    summary: null,
    agent: null,
    mode: 'watch',
    status: 'executed',
    planPath: '/tmp/work.plan.md',
    storedPath: null,
    directory: '/tmp/work',
    cwd: '/tmp',
    url: 'http://127.0.0.1:9410',
    host: '127.0.0.1',
    port: 9410,
    startedAt: now,
    endedAt: now,
    heartbeatAt: now,
    durationMs: 5_000,
    pendingCount: 0,
    phaseTotal: 2,
    phaseDone: 2,
    interactionTotal: 1,
    interactionDone: 1,
    completionRatio: 100,
    completionState: 'complete',
    executionActive: false,
    executionStep: null,
    filesModified: 1,
    outcome: null,
    git: emptyGitSnapshot(),
    ...overrides,
  }
}

test('duration labels match the dashboard page', () => {
  assert.equal(formatDuration(0), '0s')
  assert.equal(formatDuration(59_000), '59s')
  assert.equal(formatDuration(60_000), '1m')
  assert.equal(formatDuration(3_600_000), '1h 0m')
  assert.equal(formatDuration(47 * 3_600_000), '47h 0m')
  assert.equal(formatDuration(48 * 3_600_000), '2d 0h')
})

test('active plans are listed before finished plans', () => {
  const newerExecuted = plan({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'executed',
    startedAt: 300,
    executionActive: false,
  })
  const olderRunning = plan({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    status: 'running',
    startedAt: 100,
    executionActive: false,
    endedAt: null,
  })
  const executing = plan({
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    status: 'running',
    startedAt: 50,
    executionActive: true,
    executionStep: 'Implement middleware',
    endedAt: null,
  })
  const interrupted = plan({
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    status: 'interrupted',
    startedAt: 400,
  })

  const ordered = orderPlans([newerExecuted, interrupted, olderRunning, executing])
  assert.deepEqual(
    ordered.map((entry) => entry.id),
    [executing.id, olderRunning.id, interrupted.id, newerExecuted.id],
  )

  const runningOnly = presentPlans([newerExecuted, olderRunning, executing], 'running')
  assert.deepEqual(
    runningOnly.map((entry) => entry.id),
    [executing.id, olderRunning.id],
  )
})

test('status line counts the period and the client-side filter', () => {
  const line = dashboardStatusLine(
    {
      period: 'day',
      label: 'Today',
      from: 0,
      to: 0,
      plans: 2,
      started: 1,
      running: 1,
      executed: 1,
      interrupted: 0,
      filesModified: 4,
      durationMs: 1_000,
      folders: 2,
    },
    'running',
    1,
  )
  assert.match(line, /^Today · 2 plans active · 1 started in this period · showing 1$/)
})

test('tui period defaults to day and rejects an unknown period', () => {
  const day = parseTuiArgs([])
  assert.equal('error' in day, false)
  if (!('error' in day)) assert.equal(day.period, 'day')

  const week = parseTuiArgs(['--period', 'week', '--port', '9488'])
  assert.equal('error' in week, false)
  if (!('error' in week)) {
    assert.equal(week.period, 'week')
    assert.equal(week.port, 9488)
  }

  const rejected = parseTuiArgs(['--period', 'year'])
  assert.deepEqual(rejected, { error: 'period must be day, week, or month' })
})

test('terminal dashboard reads GET /api/dashboard', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-tui-'))
  const registry = await startRegistryServer({ home, port: 0, token: 'tui-token' })
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, {
      planPath,
      mode: 'watch',
      cwd: process.cwd(),
    })
    const day = await readDashboard(registry.url, 'day')
    assert.equal(day.summary.period, 'day')
    assert.equal(day.summary.label, 'Today')
    assert.equal(day.summary.running, 1)
    assert.equal(day.plans.some((entry) => entry.id === hosted.id && entry.status === 'running'), true)

    const week = await readDashboard(registry.url, 'week')
    assert.equal(week.summary.period, 'week')
    assert.equal(week.plans.some((entry) => entry.id === hosted.id), true)

    await closeHostedPlan(registry.url, registry.token, hosted.id)
    const after = await readDashboard(registry.url, 'day')
    const closed = after.plans.find((entry) => entry.id === hosted.id)
    assert.equal(closed?.status, 'executed')
    const visible = presentPlans(after.plans, 'executed')
    assert.equal(visible.some((entry) => entry.id === hosted.id), true)
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})
