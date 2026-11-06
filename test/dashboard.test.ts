import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildDashboard, periodRange } from '../src/dashboard.ts'
import { readFileSync } from 'node:fs'
import type { ExecutionState } from '../src/execution.ts'
import { parsePlan } from '../src/parse.ts'
import { measurePlan } from '../src/planProgress.ts'
import type { PlanRecord } from '../src/processRecord.ts'
import { emptyGitSnapshot, runningPlan } from '../src/processRecord.ts'
import { openRegistryStore } from '../src/registryStore.ts'
import type { PlanDocument } from '../src/types.ts'

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
    startedAt: now - 5_000,
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

test('measurePlan counts done phases and answered interactions', () => {
  const document: PlanDocument = {
    title: 'Test',
    source: '',
    interactionIds: ['ask'],
    blocks: [
      { type: 'phase', id: 'a', title: 'A', status: 'done', bodyHtml: '', source: '' },
      { type: 'phase', id: 'b', title: 'B', status: 'active', bodyHtml: '', source: '' },
    ],
  }
  const idle = measurePlan(document, [])
  assert.equal(idle.phaseDone, 1)
  assert.equal(idle.phaseTotal, 2)
  assert.equal(idle.interactionDone, 0)
  // One done phase, one active phase worth half, one open question: 1.5 of 3.
  assert.equal(idle.completionRatio, 50)
  assert.equal(idle.completionState, 'in_progress')

  const done = measurePlan(
    {
      ...document,
      blocks: [
        { type: 'phase', id: 'a', title: 'A', status: 'done', bodyHtml: '', source: '' },
        { type: 'phase', id: 'b', title: 'B', status: 'done', bodyHtml: '', source: '' },
      ],
    },
    ['ask'],
  )
  assert.equal(done.completionRatio, 100)
  assert.equal(done.completionState, 'complete')
})

test('measurePlan counts an active phase as half and reads 100% only when finished', () => {
  const document: PlanDocument = {
    title: 'Test',
    source: '',
    interactionIds: [],
    blocks: [
      { type: 'phase', id: 'a', title: 'A', status: 'active', bodyHtml: '', source: '' },
      { type: 'phase', id: 'b', title: 'B', status: 'pending', bodyHtml: '', source: '' },
      { type: 'phase', id: 'c', title: 'C', status: 'pending', bodyHtml: '', source: '' },
    ],
  }
  const started = measurePlan(document, [])
  assert.equal(started.completionRatio, 17)
  assert.equal(started.completionState, 'in_progress')

  const many: PlanDocument = {
    ...document,
    blocks: Array.from({ length: 199 }, (_, index) => ({
      type: 'phase' as const,
      id: `p${index}`,
      title: `P${index}`,
      status: index === 0 ? ('active' as const) : index < 198 ? ('done' as const) : ('pending' as const),
      bodyHtml: '',
      source: '',
    })),
  }
  const almost = measurePlan(many, [])
  assert.equal(almost.completionRatio, 99)
  assert.notEqual(almost.completionState, 'complete')
})

test('measurePlan moves phases forward from the live run and counts its other steps', () => {
  const source = readFileSync(new URL('../examples/rate-limit.plan.md', import.meta.url), 'utf8')
  const document = parsePlan(source, 'examples/rate-limit.plan.md')
  // design done, implement active, observe pending, four open interactions: 1.5 of 7.
  assert.equal(measurePlan(document, []).completionRatio, 21)

  const run: ExecutionState = {
    active: true,
    graph: {
      nodes: [
        // Same id as the workflow node that points at the phase.
        { id: 'implement', label: 'Implement', status: 'done' },
        // A run step linked to a phase by planRef.
        { id: 'ship-alerts', label: 'Alerts', status: 'active', planRef: 'observe' },
        // A step the file says is done is not moved back by the run.
        { id: 'design', label: 'Design', status: 'pending' },
        // Linked to an interaction: the answer counts, not the step.
        { id: 'limits', label: 'Limits', status: 'done' },
        // Linked to no phase or interaction: its own unit.
        { id: 'smoke-test', label: 'Smoke test', status: 'done' },
      ],
    },
  }
  const live = measurePlan(document, ['fail-mode'], run)
  assert.equal(live.phaseDone, 2)
  assert.equal(live.interactionDone, 1)
  // Phases 1 + 1 + 0.5, one answer, one extra step: 4.5 of 8.
  assert.equal(live.completionRatio, 56)
  assert.equal(live.completionState, 'in_progress')

  // A stopped run that left no graph falls back to the file.
  assert.equal(measurePlan(document, [], { active: false }).completionRatio, 21)
})

test('the store keeps the progress a live process reports and the dashboard shows it', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-progress-'))
  const store = await openRegistryStore(join(home, 'registry.sqlite'))
  try {
    const now = Date.now()
    const { status: _status, storedPath: _stored, endedAt: _ended, durationMs: _duration, outcome: _outcome, filesModified: _files, ...process } = plan({
      startedAt: now - 1_000,
      heartbeatAt: now - 1_000,
      phaseTotal: 3,
      phaseDone: 1,
      interactionTotal: 1,
      interactionDone: 0,
      completionRatio: 38,
      completionState: 'in_progress',
    })
    store.upsert({ ...process, pid: process.pid })
    assert.equal(store.list()[0]?.completionRatio, 38)

    const beat = store.heartbeat(process.id, { at: now, phaseDone: 2, completionRatio: 63, completionState: 'in_progress' })
    assert.equal(beat?.phaseDone, 2)
    assert.equal(beat?.completionRatio, 63)

    // A heartbeat without progress keeps the last report.
    store.heartbeat(process.id, { at: now + 1 })
    const listed = store.list()[0]
    assert.ok(listed)
    assert.equal(listed.completionRatio, 63)
    const row = runningPlan(listed, now)
    assert.equal(row.completionRatio, 63)
    assert.equal(row.phaseTotal, 3)
    assert.equal(row.completionState, 'in_progress')
  } finally {
    store.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('dashboard groups plans by local day, week, and month', () => {
  const now = new Date(2026, 9, 11, 15, 0, 0).getTime()
  const today = periodRange('day', now)
  const startedToday = plan({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    startedAt: today.from + 1_000,
    endedAt: today.from + 5_000,
    durationMs: 4_000,
    filesModified: 3,
    directory: '/tmp/a',
    status: 'executed',
  })
  const finishedYesterday = plan({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    startedAt: today.from - 20_000,
    endedAt: today.from - 1_000,
    durationMs: 19_000,
    filesModified: 9,
    directory: '/tmp/b',
    status: 'executed',
  })
  const stillRunning = plan({
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    startedAt: today.from - 50_000,
    endedAt: null,
    status: 'running',
    durationMs: 50_000,
    filesModified: 2,
    directory: '/tmp/c',
  })

  const day = buildDashboard([startedToday, finishedYesterday, stillRunning], 'day', now)
  assert.equal(day.summary.label, 'Today')
  assert.equal(day.summary.plans, 2)
  assert.equal(day.summary.started, 1)
  assert.equal(day.summary.running, 1)
  // No agent is connected to the open plan, so it counts as idle, not active.
  assert.equal(day.summary.active, 0)
  assert.equal(day.summary.idle, 1)
  assert.equal(buildDashboard([{ ...stillRunning, agentConnected: true }], 'day', now).summary.active, 1)
  assert.equal(day.summary.executed, 1)
  assert.equal(day.summary.filesModified, 5)
  assert.equal(day.summary.folders, 2)
  assert.equal(day.plans.some((entry) => entry.id === finishedYesterday.id), false)

  const week = buildDashboard([startedToday, finishedYesterday, stillRunning], 'week', now)
  assert.equal(week.summary.plans, 3)
  assert.equal(week.summary.executed, 2)

  const month = buildDashboard([startedToday, finishedYesterday, stillRunning], 'month', now)
  assert.equal(month.summary.label, 'This month')
  assert.equal(month.summary.plans, 3)
  assert.equal(month.summary.durationMs, 4_000 + 19_000 + 50_000)
})

test('opening the store keeps legacy process rows in plans and adds session tables', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-migrate-'))
  const dbPath = join(home, 'registry.sqlite')
  try {
    const legacy = new DatabaseSync(dbPath)
    legacy.exec(`
      CREATE TABLE processes (
        id TEXT PRIMARY KEY,
        pid INTEGER NOT NULL,
        title TEXT NOT NULL,
        summary TEXT,
        agent TEXT,
        mode TEXT NOT NULL,
        plan_path TEXT NOT NULL,
        directory TEXT NOT NULL,
        cwd TEXT NOT NULL,
        url TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        heartbeat_at INTEGER NOT NULL,
        pending_count INTEGER NOT NULL DEFAULT 0,
        execution_active INTEGER NOT NULL DEFAULT 0,
        execution_step TEXT,
        git_is_repo INTEGER NOT NULL DEFAULT 0,
        git_root TEXT,
        git_branch TEXT,
        git_commit TEXT,
        git_dirty INTEGER NOT NULL DEFAULT 0,
        git_ahead INTEGER NOT NULL DEFAULT 0,
        git_behind INTEGER NOT NULL DEFAULT 0,
        git_changed_files INTEGER NOT NULL DEFAULT 0,
        git_paths TEXT NOT NULL DEFAULT '[]',
        git_summary TEXT NOT NULL DEFAULT ''
      )
    `)
    legacy
      .prepare(
        `INSERT INTO processes (
          id, pid, title, summary, agent, mode, plan_path, directory, cwd, url, host, port,
          started_at, heartbeat_at, pending_count, execution_active, execution_step,
          git_is_repo, git_root, git_branch, git_commit, git_dirty, git_ahead, git_behind,
          git_changed_files, git_paths, git_summary
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        42,
        'Migrated plan',
        null,
        null,
        'watch',
        '/tmp/migrated.plan.md',
        '/tmp/migrated',
        '/tmp',
        'http://127.0.0.1:9410',
        '127.0.0.1',
        9410,
        1_700_000_000_000,
        1_700_000_000_500,
        1,
        0,
        null,
        1,
        '/tmp',
        'main',
        'abc1234',
        1,
        0,
        0,
        4,
        '["src/a.ts"]',
        'main @ abc1234 · dirty · 4 files',
      )
    legacy.close()

    const store = await openRegistryStore(dbPath)
    try {
      const migrated = store.get('dddddddd-dddd-4ddd-8ddd-dddddddddddd')
      assert.equal(migrated?.title, 'Migrated plan')
      assert.equal(migrated?.directory, '/tmp/migrated')
      assert.equal(migrated?.git.branch, 'main')
      assert.equal(migrated?.git.changedFiles, 4)
      assert.equal(store.list().some((entry) => entry.id === migrated?.id), true)
    } finally {
      store.close()
    }

    const check = new DatabaseSync(dbPath, { readOnly: true })
    const tables = check.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>
    assert.equal(tables.some((table) => table.name === 'plans'), true)
    assert.equal(tables.some((table) => table.name === 'processes'), false)
    assert.equal(tables.some((table) => table.name === 'plan_sessions'), false)
    const planColumns = check.prepare('PRAGMA table_info(plans)').all() as Array<{ name: string }>
    assert.equal(planColumns.some((column) => column.name === 'meta'), true)
    assert.equal(tables.some((table) => table.name === 'plan_runs'), true)
    const runColumns = check.prepare('PRAGMA table_info(plan_runs)').all() as Array<{ name: string }>
    assert.equal(runColumns.some((column) => column.name === 'title'), true)
    assert.equal(runColumns.some((column) => column.name === 'payload'), false)
    check.close()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('opening the store reads finished runs stored as JSON payloads', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-runs-'))
  const dbPath = join(home, 'registry.sqlite')
  const stored = plan({
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    title: 'Archived run',
    status: 'executed',
    outcome: 'approve',
    directory: '/tmp/archived',
    git: { ...emptyGitSnapshot(), isRepo: true, branch: 'main', changedFiles: 2, changedPaths: ['src/a.ts'], summary: 'main' },
  })
  try {
    const legacy = new DatabaseSync(dbPath)
    legacy.exec(`
      CREATE TABLE plan_runs (
        run_id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      )
    `)
    legacy
      .prepare('INSERT INTO plan_runs (run_id, started_at, payload) VALUES (?, ?, ?)')
      .run(`${stored.id}:${stored.startedAt}`, stored.startedAt, JSON.stringify(stored))
    legacy.close()

    const store = await openRegistryStore(dbPath)
    try {
      const runs = store.listRuns()
      assert.equal(runs.length, 1)
      assert.equal(runs[0]?.title, 'Archived run')
      assert.equal(runs[0]?.status, 'executed')
      assert.equal(runs[0]?.outcome, 'approve')
      assert.equal(runs[0]?.directory, '/tmp/archived')
      assert.equal(runs[0]?.git.branch, 'main')
      assert.deepEqual(runs[0]?.git.changedPaths, ['src/a.ts'])
    } finally {
      store.close()
    }
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('finished runs are selected by the period window in sqlite', async () => {
  const store = await openRegistryStore(':memory:')
  const day = 86_400_000
  const todayStart = Date.UTC(2026, 9, 12)
  try {
    store.saveRun(
      plan({
        id: 'before',
        startedAt: todayStart - 2 * day,
        endedAt: todayStart - day,
        heartbeatAt: todayStart - day,
      }),
    )
    store.saveRun(
      plan({
        id: 'spans',
        startedAt: todayStart - day,
        endedAt: todayStart + 3_600_000,
        heartbeatAt: todayStart + 3_600_000,
      }),
    )
    store.saveRun(
      plan({
        id: 'inside',
        startedAt: todayStart + 1_000,
        endedAt: todayStart + 2_000,
        heartbeatAt: todayStart + 2_000,
        status: 'interrupted',
      }),
    )
    store.saveRun(
      plan({
        id: 'after',
        startedAt: todayStart + day,
        endedAt: todayStart + day + 1_000,
        heartbeatAt: todayStart + day + 1_000,
      }),
    )

    const window = { from: todayStart, to: todayStart + day - 1 }
    assert.deepEqual(
      store.listRuns(window).map((entry) => entry.id).sort(),
      ['inside', 'spans'],
    )
    assert.equal(store.listRuns().length, 4)
  } finally {
    store.close()
  }
})

test('opening the store backfills ended_at on legacy plan runs', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-ended-'))
  const dbPath = join(home, 'registry.sqlite')
  try {
    const legacy = new DatabaseSync(dbPath)
    legacy.exec(`
      CREATE TABLE plan_runs (
        run_id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        payload TEXT NOT NULL
      )
    `)
    const insert = legacy.prepare('INSERT INTO plan_runs (run_id, started_at, payload) VALUES (?, ?, ?)')
    insert.run(
      'early:1000',
      1_000,
      JSON.stringify(plan({ id: 'early', startedAt: 1_000, endedAt: 2_000, heartbeatAt: 2_000 })),
    )
    insert.run(
      'later:5000',
      5_000,
      JSON.stringify(plan({ id: 'later', startedAt: 5_000, endedAt: 9_000, heartbeatAt: 9_000 })),
    )
    legacy.close()

    const store = await openRegistryStore(dbPath)
    try {
      assert.deepEqual(
        store.listRuns({ from: 4_000, to: 8_000 }).map((entry) => entry.id),
        ['later'],
      )
    } finally {
      store.close()
    }
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
