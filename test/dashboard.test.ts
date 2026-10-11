import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildDashboard, periodRange } from '../src/dashboard.ts'
import { measurePlan } from '../src/planProgress.ts'
import type { PlanRecord } from '../src/processRecord.ts'
import { emptyGitSnapshot } from '../src/processRecord.ts'
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
  assert.equal(idle.completionRatio, 33)
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

test('opening the store keeps legacy process rows and adds session tables', async () => {
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
    assert.equal(tables.some((table) => table.name === 'processes'), true)
    assert.equal(tables.some((table) => table.name === 'plan_sessions'), true)
    assert.equal(tables.some((table) => table.name === 'plan_runs'), true)
    check.close()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
