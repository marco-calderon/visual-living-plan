import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Database } from 'bun:sqlite'
import { HttpError } from '../src/http.ts'
import {
  commitUserMutation,
  initPlan,
  planSnapshot,
  putExecution,
  putSource,
  submitComment,
  type PlanSql,
} from '../src/host/planRoom.ts'
import {
  OWNED_PLAN_CAP,
  SOURCE_BODY_CAP,
  WARM_INTERVAL_MS,
  applyLiveToPlan,
  catalogFromOwned,
  catalogRows,
  commentPartReady,
  commentRowsFromSnapshot,
  dashboardAccountDecision,
  inspectMutation,
  isAccountNetworkFailure,
  mergeAgentDocument,
  offlineStatusText,
  planRowFromSnapshot,
  plansToEvict,
  plansToWarm,
  settingsWinner,
  warmRecordSaved,
  type PlanRow,
} from '../src/offlineSync.ts'
import { openPlanSession } from '../src/planSession.ts'

test('a repeated idempotency key replays and a different body conflicts', () => {
  const records = [] as { key: string; body: string; result: unknown }[]
  const first = inspectMutation({
    kind: 'comment',
    key: 'k1',
    body: { partId: 'intro', text: 'Hello', baseRevision: 3 },
    baseRevision: 3,
    currentRevision: 3,
    executionActive: false,
    source: 'intro',
    records,
  })
  assert.equal(first.action, 'apply')
  if (first.action !== 'apply') return
  records.push({ key: 'k1', body: JSON.stringify({ partId: 'intro', text: 'Hello' }), result: { ok: true, id: 'cmt_1' } })
  const replay = inspectMutation({
    kind: 'comment',
    key: 'k1',
    body: { text: 'Hello', partId: 'intro', baseRevision: 4 },
    baseRevision: 4,
    currentRevision: 9,
    executionActive: true,
    source: 'intro',
    records,
  })
  assert.deepEqual(replay, { action: 'replay', result: { ok: true, id: 'cmt_1' } })
  const conflict = inspectMutation({
    kind: 'comment',
    key: 'k1',
    body: { partId: 'intro', text: 'Changed', baseRevision: 3 },
    baseRevision: 3,
    currentRevision: 3,
    executionActive: false,
    source: 'intro',
    records,
  })
  assert.equal(conflict.action, 'reject')
})

test('a stale revision, a locked form, and a missing part are rejected once', () => {
  const base = {
    kind: 'comment' as const,
    key: 'k2',
    body: { partId: 'intro', text: 'Hello', baseRevision: 1 },
    baseRevision: 1,
    currentRevision: 2,
    executionActive: false,
    source: 'intro',
    records: [],
  }
  assert.equal(inspectMutation(base).action, 'reject')
  assert.match(message(inspectMutation({ ...base, currentRevision: 1, executionActive: true })), /Execution is active/)
  assert.match(message(inspectMutation({ ...base, currentRevision: 1, source: 'other' })), /gone/)
  assert.equal(inspectMutation({ ...base, key: null, baseRevision: null, body: { partId: 'missing', text: 'Hello' } }).action, 'apply')
})

test('a comment on a rendered plan part is ready while its block is in the source', () => {
  const source = [
    '# Rollout',
    '',
    'Intro prose.',
    '',
    '<phase id="design" title="Design" status="done">',
    'Body',
    '</phase>',
    '',
    "<choice id='fail-mode' prompt='If Redis is down?'>",
    '<option id="open" label="Fail open" />',
    '</choice>',
    '',
    '<callout title="No id" kind="note">',
    'Note',
    '</callout>',
  ].join('\n')
  // Part ids as the page stamps them (data-plan-part).
  for (const partId of [
    'choice:fail-mode/prompt',
    'phase:design/paragraph:1',
    'phase:design',
    'markdown:0/heading:1',
    'callout:2/paragraph:1',
    'review:message',
  ]) {
    assert.equal(commentPartReady(source, partId), true, partId)
  }
  for (const partId of ['choice:removed/prompt', 'form:fail-mode/field:1', 'phase:desig/paragraph:1', 'choice:/prompt', '']) {
    assert.equal(commentPartReady(source, partId), false, partId)
  }
  const base = {
    kind: 'comment' as const,
    key: 'k3',
    body: { partId: 'choice:fail-mode/prompt', text: 'Hello', baseRevision: 0 },
    baseRevision: 0,
    currentRevision: 0,
    executionActive: false,
    source,
    records: [],
  }
  assert.equal(inspectMutation(base).action, 'apply')
  assert.match(message(inspectMutation({ ...base, body: { ...base.body, partId: 'choice:removed/prompt' } })), /gone/)
})

test('the local session accepts an offline comment on a rendered plan part', async () => {
  const home = await mkdtemp(join(tmpdir(), 'living-plan-offline-'))
  const planPath = join(home, 'demo.plan.md')
  await writeFile(
    planPath,
    '# Demo\n\n<choice id="fail-mode" prompt="If Redis is down?">\n<option id="open" label="Fail open">\nAllow traffic.\n</option>\n</choice>\n',
  )
  const session = await openPlanSession({ id: 'plan5678', token: 'token', planPath, mode: 'watch' })
  const request = new Request('http://127.0.0.1/', { headers: { 'idempotency-key': 'comment-part-1' } })
  const created = session.submitComment(
    { partId: 'choice:fail-mode/prompt', kind: 'prompt', text: 'Prefer fail open', baseRevision: 0 },
    request,
  ) as { comment: { id: string } }
  assert.ok(created.comment.id)
  assert.equal(session.snapshot().events.filter((event) => event.event === 'comment').length, 1)
  await session.close()
  await rm(home, { recursive: true, force: true })
})

test('agent source replaces an older browser copy and a large body is not stored', () => {
  const replaced = mergeAgentDocument({ revision: 1, source: 'local' }, { revision: 2, source: 'agent' })
  assert.equal(replaced.replaced, true)
  assert.equal(replaced.source, 'agent')
  const same = mergeAgentDocument({ revision: 4, source: 'kept' }, { revision: 3, source: 'old' })
  assert.equal(same.source, 'kept')
  const tied = mergeAgentDocument({ revision: 4, source: 'browser' }, { revision: 4, source: 'agent' })
  assert.equal(tied.source, 'agent')

  const previous = row({ source: 'kept', revision: 1, responses: { 'fail-mode': { optionId: 'open' }, saved: { optionId: 'kept' } } })
  const stored = planRowFromSnapshot('p1', 'local', '', { ...snapshot(), source: 'x'.repeat(SOURCE_BODY_CAP + 1), revision: 2, responses: { saved: { optionId: 'server' } } }, previous, 10)
  assert.equal(stored.sourceOmitted, true)
  assert.equal(stored.source, 'kept')
  assert.equal(stored.revision, 2)
  assert.deepEqual(stored.responses['fail-mode'], { optionId: 'open' })
  assert.deepEqual(stored.responses.saved, { optionId: 'server' })
})

test('live plan data and catalog rows stay free of the source body', () => {
  const next = applyLiveToPlan(row({ source: 'one', revision: 1 }), 'plan', { source: 'two', revision: 2, title: 'Next' })
  assert.equal(next.source, 'two')
  assert.equal(next.title, 'Next')
  const comments = commentRowsFromSnapshot('p1', [{ id: 'c1', partId: 'intro', text: 'Hi' }], [
    { id: 'pending:1', planId: 'p1', partId: 'intro', pending: true, comment: { id: 'pending:1' } },
    { id: 'c1', planId: 'p1', partId: 'intro', pending: true, comment: { id: 'c1' } },
  ])
  assert.deepEqual(comments.map((entry) => entry.id), ['c1', 'pending:1'])
  const catalog = catalogRows([{ id: 'p1', title: 'Demo', mode: 'watch', status: 'running', source: 'secret' }])
  assert.equal(catalog[0]?.versionLabel, '')
  assert.equal('source' in (catalog[0] ?? {}), false)
  assert.deepEqual(plansToEvict(
    [
      { id: 'open', openedAt: 5 },
      { id: 'a', openedAt: 4 },
      { id: 'b', openedAt: 3 },
      { id: 'c', openedAt: 2 },
      { id: 'd', openedAt: 1 },
    ],
    'open',
  ), ['d'])
  assert.deepEqual(plansToEvict(
    [
      { id: 'open', openedAt: 5 },
      { id: 'owned-old', openedAt: 1 },
      { id: 'a', openedAt: 4 },
      { id: 'b', openedAt: 3 },
      { id: 'c', openedAt: 2 },
      { id: 'd', openedAt: 0 },
    ],
    'open',
    4,
    ['owned-old'],
  ), ['d'])
  assert.deepEqual(plansToEvict(
    [
      { id: 'gone', openedAt: 9 },
      { id: 'open', openedAt: 1 },
    ],
    'open',
    4,
    [],
    ['gone'],
  ), ['gone'])
  const owned = Array.from({ length: OWNED_PLAN_CAP + 2 }, (_, index) => `p${String(index).padStart(2, '0')}`)
  const evicted = plansToEvict(
    owned.map((id, index) => ({ id, openedAt: index })),
    'p00',
    4,
    owned,
  )
  assert.deepEqual(evicted, ['p50', 'p51'])
  const now = 1_000_000
  assert.deepEqual(plansToWarm(
    [
      { id: 'new', versionKey: '5/', recency: 5 },
      { id: 'same', versionKey: '2/', recency: 4 },
      { id: 'stale', versionKey: '3/', recency: 3 },
      { id: 'old', versionKey: '1/', recency: 1 },
    ],
    [
      { id: 'same', versionKey: '2/', warmedAt: now - 1000 },
      { id: 'stale', versionKey: '3/', warmedAt: now - WARM_INTERVAL_MS - 1 },
    ],
    now,
  ), ['new', 'stale', 'old'])
  const many = Array.from({ length: OWNED_PLAN_CAP + 1 }, (_, index) => ({
    id: `w${String(index).padStart(2, '0')}`,
    versionKey: '1/',
    recency: OWNED_PLAN_CAP - index,
  }))
  const warm = plansToWarm(many, [], now)
  assert.equal(warm.length, OWNED_PLAN_CAP)
  assert.equal(warm[0], 'w00')
  assert.equal(warm.includes('w50'), false)
  const listed = catalogFromOwned(
    [{ id: 'p1', title: 'Owned' }],
    [{ id: 'p1', heartbeatAt: 9, storedPath: 'plans/p1.md', status: 'running' }],
  )
  assert.equal(listed[0]?.versionKey, '9/plans/p1.md')
  const kept = catalogFromOwned(
    [{ id: 'p1', title: 'Owned' }],
    [{ id: 'p1', heartbeatAt: 9, storedPath: 'plans/p1.md', status: 'running' }],
    [{ id: 'p1', title: 'Owned', mode: '', status: '', versionLabel: '', warmedAt: 4, failedAt: 8, cacheName: 'visual-living-plan-shell-1.12.0' }],
  )
  assert.equal(kept[0]?.warmedAt, 4)
  assert.equal(kept[0]?.failedAt, 8)
  assert.equal(kept[0]?.cacheName, 'visual-living-plan-shell-1.12.0')
  assert.equal(dashboardAccountDecision({ ok: false, networkFailure: false, hasStored: true }), 'login')
  assert.equal(dashboardAccountDecision({ ok: null, networkFailure: true, hasStored: true }), 'stored')
  assert.equal(dashboardAccountDecision({ ok: null, networkFailure: true, hasStored: false }), 'error')
  assert.equal(dashboardAccountDecision({ ok: true, networkFailure: false, hasStored: false }), 'account')
  assert.equal(isAccountNetworkFailure(new TypeError('Failed to fetch'), true), true)
  assert.equal(isAccountNetworkFailure(new Error('nope'), true), false)
  assert.equal(isAccountNetworkFailure(new Error('nope'), false), true)
  assert.equal(offlineStatusText({ available: true, offline: true, pending: 2, failed: 0 }), 'Offline · 2 pending')
  assert.equal(offlineStatusText({ available: false, offline: true, pending: 2, failed: 1 }), null)
  assert.equal(settingsWinner({ updatedAt: 5, accent: 'old' }, { updatedAt: 4, accent: 'new' }).accent, 'old')
})

test('a failed warm is not saved, and a different shell cache is due', () => {
  const now = 1_000_000
  const cache = 'visual-living-plan-shell-1.12.1'
  const owned = [{ id: 'bad', versionKey: '1/', recency: 2 }]
  const failed = [{ id: 'bad', versionKey: '1/', failedAt: now - 1000, cacheName: cache }]
  assert.deepEqual(plansToWarm(owned, failed, now, OWNED_PLAN_CAP, cache), [])
  assert.equal(warmRecordSaved(failed[0], cache), false)
  assert.deepEqual(plansToWarm(owned, failed, now + WARM_INTERVAL_MS, OWNED_PLAN_CAP, cache), ['bad'])
  const previousCache = [{ id: 'bad', versionKey: '1/', warmedAt: now - 1000, cacheName: 'visual-living-plan-shell-1.12.0' }]
  assert.equal(warmRecordSaved(previousCache[0], cache), false)
  assert.deepEqual(plansToWarm(owned, previousCache, now, OWNED_PLAN_CAP, cache), ['bad'])
  const saved = [{ id: 'bad', versionKey: '1/', warmedAt: now - 1000, cacheName: cache }]
  assert.equal(warmRecordSaved(saved[0], cache), true)
  assert.deepEqual(plansToWarm(owned, saved, now, OWNED_PLAN_CAP, cache), [])
})

test('the durable object replays one submission and keeps a single event', () => {
  const db = new Database(':memory:')
  const sql = sqlOf(db)
  initPlan(sql, { token: 'plan-token', title: 'Demo', mode: 'watch', tier: 'free', source: '# Demo\n' })
  const body = { partId: 'Demo', text: 'Ship it', baseRevision: 0 }
  const first = commitUserMutation(sql, { kind: 'comment', key: 'comment-1', body }, (clean) => submitComment(sql, clean))
  const second = commitUserMutation(sql, { kind: 'comment', key: 'comment-1', body }, (clean) => submitComment(sql, clean))
  assert.equal(first.status, 200)
  assert.deepEqual(second.body, first.body)
  assert.equal(db.query('SELECT COUNT(*) AS n FROM events').get().n, 1)
  const conflict = commitUserMutation(sql, { kind: 'comment', key: 'comment-1', body: { ...body, text: 'Other' } }, (clean) => submitComment(sql, clean))
  assert.equal(conflict.status, 409)
  assert.equal(db.query('SELECT COUNT(*) AS n FROM events').get().n, 1)
  putSource(sql, { markdown: '# Demo\n\nAgent edit\n', revision: 0 })
  const stale = commitUserMutation(sql, { kind: 'comment', key: 'comment-2', body: { partId: 'Demo', text: 'Late', baseRevision: 0 } }, (clean) => submitComment(sql, clean))
  assert.equal(stale.status, 409)
  assert.equal(planSnapshot(sql).source.includes('Agent edit'), true)
  putExecution(sql, { active: true })
  const locked = commitUserMutation(sql, { kind: 'review', key: 'review-1', body: { decision: 'approve', baseRevision: planSnapshot(sql).revision } }, () => {
    throw new Error('should not apply')
  })
  assert.equal(locked.status, 409)
  assert.match(String((locked.body as { error?: string }).error), /Execution is active/)
})

test('the local session replays one comment and lets an agent edit win', async () => {
  const home = await mkdtemp(join(tmpdir(), 'living-plan-offline-'))
  const planPath = join(home, 'demo.plan.md')
  await writeFile(planPath, '# Demo\n')
  const session = await openPlanSession({
    id: 'plan1234',
    token: 'token',
    planPath,
    mode: 'watch',
  })
  const request = new Request('http://127.0.0.1/', { headers: { 'idempotency-key': 'comment-1' } })
  const body = { partId: 'Demo', kind: 'part', text: 'Ship it', baseRevision: 0 }
  const first = session.submitComment(body, request) as { comment: { id: string } }
  const second = session.submitComment(body, request) as { comment: { id: string } }
  assert.equal(second.comment.id, first.comment.id)
  assert.equal(session.snapshot().events.filter((event) => event.event === 'comment').length, 1)
  assert.throws(() => session.submitComment({ ...body, text: 'Other' }, request), HttpError)
  const snapshot = session.offlineSnapshot()
  assert.equal(snapshot.revision, 0)
  assert.equal(snapshot.comments.length, 1)
  await writeFile(planPath, '# Demo\n\nAgent edit\n')
  await new Promise((resolve) => setTimeout(resolve, 50))
  const after = session.offlineSnapshot()
  assert.equal(after.revision > snapshot.revision, true)
  assert.match(after.source, /Agent edit/)
  const stale = new Request('http://127.0.0.1/', { headers: { 'idempotency-key': 'comment-2' } })
  assert.throws(() => session.submitComment({ ...body, text: 'Too late', baseRevision: snapshot.revision }, stale), (error: unknown) => error instanceof HttpError && error.status === 409)
  await session.close()
  await rm(home, { recursive: true, force: true })
})

function message(result: { action: string; message?: string }): string {
  return result.action === 'reject' ? result.message ?? '' : ''
}

function snapshot() {
  return { revision: 0, source: 'intro', title: 'Demo', mode: 'watch', responses: {}, comments: [], review: null, locked: false }
}

function row(patch: Partial<PlanRow>): PlanRow {
  return {
    id: 'p1',
    revision: 0,
    source: 'intro',
    title: 'Demo',
    mode: 'watch',
    responses: {},
    review: null,
    locked: false,
    host: 'local',
    basePath: '',
    openedAt: 1,
    sourceOmitted: false,
    ...patch,
  }
}

function sqlOf(db: Database): PlanSql {
  return {
    exec(query, ...bindings) {
      const statement = db.query(query)
      if (query.trim().toLowerCase().startsWith('select')) {
        return { toArray: () => statement.all(...bindings) as Array<Record<string, unknown>> }
      }
      statement.run(...bindings)
      return { toArray: () => [] }
    },
  }
}
