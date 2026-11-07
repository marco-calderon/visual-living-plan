import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Database } from 'bun:sqlite'
import { fileURLToPath } from 'node:url'
import { agentSlotsFull, allows } from '../src/host/access.ts'
import { sessionFromToken } from '../src/host/auth.ts'
import { mergeAccountSettings, readAccountSettings, saveAccountSettings } from '../src/host/accountSettings.ts'
import { NO_PROGRESS, hostedDashboard, hostedProgress, saveHostedProgress } from '../src/host/hostedDashboard.ts'
import { LATEST_PLAN_VERSION_SQL, PLAN_VERSION_LIMIT, ensurePlanVersions, publishPlanVersion, readPlanVersion } from '../src/host/planVersions.ts'
import type { HostedPlanRow } from '../src/host/hostedDashboard.ts'
import {
  ackEvents,
  closePlan,
  executionView,
  initPlan,
  planView,
  putExecution,
  pendingEvents,
  planHosted,
  planProgress,
  putSource,
  touchPlan,
  StaleRevision,
  submitInteraction,
  addressComment,
  liveExecution,
  markCommentAddressing,
  submitComment,
  type PlanSql,
} from '../src/host/planRoom.ts'
import { planUrlOnCalledOrigin, registerCloudPlan, uploadSource } from '../src/cloudClient.ts'
import { requestOrigin } from '../src/host/requestOrigin.ts'
import { renderDashboardPage } from '../src/dashboardPage.ts'
import { cloudIdInSource, sourceWithCloudId } from '../src/cloudFrontmatter.ts'
import { readRegistryLock, type RegistryLock } from '../src/registryLock.ts'
import { localServiceUrl, rewriteToBindUrl } from '../src/registryClient.ts'

const entry = fileURLToPath(new URL('../src/cli.ts', import.meta.url))

test('a published cloud plan keeps the latest 10 documents', async () => {
  const db = new Database(':memory:')
  const store = d1Of(db)
  for (let n = 1; n <= PLAN_VERSION_LIMIT + 1; n += 1) {
    const saved = await publishPlanVersion(store, {
      planId: 'plan1234',
      userId: 'user-1',
      title: 'Demo',
      source: `# v${n}\n`,
      now: n,
    })
    assert.equal(saved.stored, true)
    assert.equal(saved.seq, n)
  }
  const same = await publishPlanVersion(store, {
    planId: 'plan1234',
    userId: 'user-1',
    title: 'Demo',
    source: `# v${PLAN_VERSION_LIMIT + 1}\n`,
  })
  assert.equal(same.stored, false)
  assert.equal(same.seq, PLAN_VERSION_LIMIT + 1)
  const renamed = await publishPlanVersion(store, {
    planId: 'plan1234',
    userId: 'user-1',
    title: 'Renamed',
    source: `# v${PLAN_VERSION_LIMIT + 1}\n`,
    now: 20,
  })
  assert.equal(renamed.stored, true)
  assert.equal(renamed.seq, PLAN_VERSION_LIMIT + 2)
  assert.equal(await readPlanVersion(store, 'plan1234', 1), null)
  assert.equal(await readPlanVersion(store, 'plan1234', 2), null)
  const kept = await readPlanVersion(store, 'plan1234', 3)
  assert.equal(kept?.source, '# v3\n')
  const latest = await readPlanVersion(store, 'plan1234', 'latest')
  assert.equal(latest?.seq, PLAN_VERSION_LIMIT + 2)
  assert.equal(latest?.title, 'Renamed')
  const count = db.query('SELECT COUNT(*) AS n FROM plan_versions').get() as { n: number }
  assert.equal(count.n, PLAN_VERSION_LIMIT)
})

test('a hosted plan is listed when the versions table was missing', async () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE plans (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    token TEXT,
    title TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    plan_path TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    heartbeat_at INTEGER NOT NULL,
    meta TEXT NOT NULL
  )`)
  const now = Date.UTC(2026, 9, 31, 18, 0, 0)
  db.query(
    `INSERT INTO plans (id, user_id, token, title, mode, status, plan_path, started_at, ended_at, heartbeat_at, meta)
     VALUES (?, ?, ?, ?, ?, 'running', NULL, ?, NULL, ?, ?)`,
  ).run('rate-limit-rollout', 'user-1', 'token', 'Rate limiting rollout', 'watch', now, now, JSON.stringify({ tier: 'pro' }))
  const store = d1Of(db)
  await ensurePlanVersions(store)
  const before = await store.prepare(LATEST_PLAN_VERSION_SQL).bind('user-1').all<HostedPlanRow>()
  assert.equal(before.results?.[0]?.id, 'rate-limit-rollout')
  assert.equal(before.results?.[0]?.version_seq ?? null, null)
  const saved = await publishPlanVersion(store, {
    planId: 'rate-limit-rollout',
    userId: 'user-1',
    title: 'Rate limiting rollout',
    source: '# Rate limiting rollout\n',
    now,
  })
  assert.equal(saved.stored, true)
  assert.equal(saved.seq, 1)
  const after = await store.prepare(LATEST_PLAN_VERSION_SQL).bind('user-1').all<HostedPlanRow>()
  const payload = hostedDashboard(after.results ?? [], 'day', 'https://plan.example', now + 1000)
  assert.equal(payload.summary.running, 1)
  assert.equal(payload.plans[0]?.title, 'Rate limiting rollout')
  assert.equal(payload.plans[0]?.status, 'running')
  const plan = payload.plans[0] as { fileUrl?: string; historyUrl?: string }
  assert.equal(plan.fileUrl, '/plans/rate-limit-rollout/document')
  assert.equal(plan.historyUrl, '/plans/rate-limit-rollout/history')
})

test('the hosted dashboard lists a stored plan the way the local dashboard does', () => {
  const now = Date.UTC(2026, 9, 30, 18, 0, 0)
  const payload = hostedDashboard(
    [
      {
        id: 'plan1234',
        title: 'Demo',
        mode: 'watch',
        ended_at: null,
        started_at: now - 60_000,
        version_seq: 3,
        version_title: 'Demo',
        version_at: now - 1000,
      },
    ],
    'day',
    'https://plans.example',
    now,
  )
  assert.equal(payload.summary.running, 1)
  assert.equal(payload.summary.executed, 0)
  assert.equal(payload.plans[0]?.status, 'running')
  assert.equal(payload.plans[0]?.executionStep, 'version 3')
  assert.equal(payload.plans[0]?.directory, '/plans/plan1234/')
  const plan = payload.plans[0] as { fileUrl?: string; historyUrl?: string }
  assert.equal(plan.fileUrl, '/plans/plan1234/document')
  assert.equal(plan.historyUrl, '/plans/plan1234/history')
  const local = renderDashboardPage()
  assert.match(local, /<header class="titlebar">/)
  assert.doesNotMatch(local, /data-history-back/)
  assert.match(local, /href="\/">Running plans/)
  assert.match(local, /registry's plans folder/)
  assert.match(local, /const apiPath = "\/api\/dashboard"/)
  assert.doesNotMatch(local, /api\/account\/dashboard/)
  assert.doesNotMatch(local, /data-account-section/)
  assert.doesNotMatch(local, /href="\/settings"/)
})

test('the account session token from sign-in is accepted without a browser cookie', async () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT, email TEXT, tier TEXT);
    CREATE TABLE session (id TEXT PRIMARY KEY, token TEXT, userId TEXT, expiresAt TEXT);
  `)
  const store = d1Of(db)
  db.query('INSERT INTO user (id, name, email, tier) VALUES (?, ?, ?, ?)').run('user-1', 'Person', 'person@example.com', 'free')
  db.query('INSERT INTO session (id, token, userId, expiresAt) VALUES (?, ?, ?, ?)').run('s1', 'session-token', 'user-1', new Date(Date.now() + 60_000).toISOString())
  const session = await sessionFromToken(store, 'session-token')
  assert.equal(session?.user.email, 'person@example.com')
  assert.equal(session?.session.token, 'session-token')
  db.query('UPDATE session SET expiresAt = ? WHERE token = ?').run(new Date(Date.now() - 1000).toISOString(), 'session-token')
  assert.equal(await sessionFromToken(store, 'session-token'), null)
  assert.equal(await sessionFromToken(store, 'plan-token'), null)
})

test('a loopback publish stays on the host the CLI called', async () => {
  assert.equal(
    planUrlOnCalledOrigin('http://127.0.0.1:8787', 'http://plan.logspace.qzz.io/plans/plan1234/'),
    'http://127.0.0.1:8787/plans/plan1234/',
  )
  assert.equal(
    planUrlOnCalledOrigin('https://plans.example', 'https://plan.logspace.qzz.io/plans/plan1234/'),
    'https://plan.logspace.qzz.io/plans/plan1234/',
  )
  const previous = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    assert.equal(url.origin, 'http://127.0.0.1:8787')
    assert.equal(new Headers(init?.headers).get('x-living-plan-origin'), '127.0.0.1:8787')
    return Response.json({
      plan: {
        id: 'plan1234',
        url: 'http://plan.logspace.qzz.io/plans/plan1234/',
        token: 'plan-token',
        mode: 'watch',
      },
      revision: 1,
    })
  }) as typeof fetch
  try {
    const registered = await registerCloudPlan('http://127.0.0.1:8787', 'account-token', {
      mode: 'watch',
      title: 'Demo',
      markdown: '# Demo\n',
    })
    assert.equal(registered.url, 'http://127.0.0.1:8787/plans/plan1234/')
  } finally {
    globalThis.fetch = previous
  }
})

test('a local Worker uses the loopback origin the CLI called', () => {
  const local = new Request('http://plan.logspace.qzz.io/api/plans', {
    headers: { 'cf-connecting-ip': '127.0.0.1', 'x-living-plan-origin': '127.0.0.1:8787' },
  })
  assert.equal(requestOrigin(local, 'https://plan.logspace.qzz.io'), 'http://127.0.0.1:8787')
  const remote = new Request('https://plan.logspace.qzz.io/api/plans', {
    headers: { 'cf-connecting-ip': '203.0.113.4', 'x-living-plan-origin': 'http://127.0.0.1:8787' },
  })
  assert.equal(requestOrigin(remote, 'https://plan.logspace.qzz.io'), 'https://plan.logspace.qzz.io')
  const hintedPublic = new Request('http://127.0.0.1:8787/api/plans', {
    headers: { 'cf-connecting-ip': '127.0.0.1', 'x-living-plan-origin': 'https://evil.example' },
  })
  assert.equal(requestOrigin(hintedPublic), 'http://127.0.0.1:8787')
})

test('account settings stay on the hosted database', async () => {
  const db = new Database(':memory:')
  const saved = await saveAccountSettings(d1Of(db), 'user-1', { accent: '#b45309', pageWidth: 'full', wrapCode: true, diffsTheme: 'nope' })
  assert.equal(saved.accent, '#b45309')
  assert.equal(saved.pageWidth, 'full')
  assert.equal(saved.wrapCode, true)
  assert.equal(saved.diffsTheme, 'pierre')
  const again = await readAccountSettings(d1Of(db), 'user-1')
  assert.deepEqual(again, saved)
  const kept = mergeAccountSettings(again, { accent: 'not-a-color' })
  assert.equal(kept.accent, '#b45309')
})

function d1Of(db: Database): D1Database {
  return {
    prepare(sql: string) {
      const run = (...values: unknown[]) => {
        const statement = db.query(sql)
        return {
          async first<T>() {
            return (statement.get(...(values as never[])) as T | null) ?? null
          },
          async run() {
            statement.run(...(values as never[]))
            return { success: true }
          },
          async all<T>() {
            return { results: statement.all(...(values as never[])) as T[] }
          },
        }
      }
      return { ...run(), bind: (...values: unknown[]) => run(...values) }
    },
  } as unknown as D1Database
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

test('an https plan URL is not rewritten onto the local registry', async () => {
  const home = await mkdtemp(join(tmpdir(), 'living-plan-cloud-'))
  const lock: RegistryLock = {
    pid: process.pid,
    port: 9477,
    host: '127.0.0.1',
    url: 'http://127.0.0.1:9477',
    token: 'registry-token',
    startedAt: Date.now(),
  }
  await writeFile(join(home, 'registry.json'), JSON.stringify(lock))
  const published = 'https://plans.example/plans/abc12345/'
  assert.equal(rewriteToBindUrl(lock, published), published)
  assert.equal(await localServiceUrl(published, home), published)
  await rm(home, { recursive: true, force: true })
})

test('cloudId is written into frontmatter once', () => {
  const source = '---\ntitle: Demo\n---\n# Demo\n'
  const once = sourceWithCloudId(source, 'plan_12345678')
  assert.equal(cloudIdInSource(once), 'plan_12345678')
  assert.equal(sourceWithCloudId(once, 'plan_12345678'), once)
  assert.match(once, /title: Demo/)
})

test('a stale source upload retries once', async () => {
  const revisions: number[] = []
  const fetchImpl: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { revision: number }
    revisions.push(body.revision)
    if (revisions.length === 1) return Response.json({ revision: 4 }, { status: 409 })
    return Response.json({ revision: 5 })
  }
  const next = await uploadSource({
    planUrl: 'https://plans.example/plans/abc12345/',
    token: 'plan-token',
    markdown: '# Demo\n',
    revision: 1,
    fetchImpl,
  })
  assert.deepEqual(revisions, [1, 4])
  assert.equal(next, 5)
})

test('a closed plan reports the host message instead of a stale revision', async () => {
  const fetchImpl: typeof fetch = async () => new Response('This plan is closed.', { status: 409 })
  await assert.rejects(
    () => uploadSource({
      planUrl: 'https://plans.example/plans/abc12345/',
      token: 'plan-token',
      markdown: '# Demo\n',
      revision: 1,
      fetchImpl,
    }),
    /This plan is closed\./,
  )
})

test('plan room stores a submission until it is acked', () => {
  const db = new Database(':memory:')
  const sql = sqlOf(db)
  initPlan(sql, { token: 'plan-token', title: 'Demo', mode: 'watch', tier: 'free', source: '# Demo\n' })
  assert.throws(() => putSource(sql, { markdown: '# Next\n', revision: 3 }), StaleRevision)
  const saved = putSource(sql, { markdown: '# Next\n', revision: 0 })
  assert.equal(saved.revision, 1)
  const sent = submitInteraction(sql, 'choice', { kind: 'choice', id: 'choice', optionId: 'a', label: 'A' })
  assert.equal(sent.outbound[0]?.event, 'notice')
  assert.equal(pendingEvents(sql).length, 1)
  const id = String((sent.outbound[0]?.data as { id: string }).id)
  ackEvents(sql, [id])
  assert.equal(pendingEvents(sql).length, 0)
})

test('plan room measures progress from its source, answers, and live run', async () => {
  const db = new Database(':memory:')
  const sql = sqlOf(db)
  const source = readFileSync(new URL('../examples/rate-limit.plan.md', import.meta.url), 'utf8')
  initPlan(sql, { token: 'plan-token', title: 'Rate limiting rollout', mode: 'watch', tier: 'free', source })
  const first = await planProgress(sql)
  assert.equal(first?.phaseTotal, 3)
  assert.equal(first?.interactionTotal, 4)
  assert.equal(first?.completionRatio, 21)
  assert.equal(first?.completionState, 'in_progress')

  submitInteraction(sql, 'fail-mode', { kind: 'choice', id: 'fail-mode', optionId: 'open', label: 'Open' })
  putExecution(sql, { active: true, graph: { nodes: [{ id: 'implement', label: 'Implement', status: 'done' }] } })
  const later = await planProgress(sql)
  assert.equal(later?.interactionDone, 1)
  assert.equal(later?.phaseDone, 2)
  // Phases 1 + 1 + 0, one answer: 3 of 7.
  assert.equal(later?.completionRatio, 43)

  // Old tag syntax does not parse.
  putSource(sql, { markdown: '{% phase id="x" %}', revision: planView(sql).revision })
  assert.equal(await planProgress(sql), null)
})

test('the hosted dashboard shows the progress saved on the plan row', async () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE plans (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    token TEXT,
    title TEXT NOT NULL,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    plan_path TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    heartbeat_at INTEGER NOT NULL,
    meta TEXT NOT NULL
  )`)
  const now = Date.UTC(2026, 10, 4, 18, 0, 0)
  db.query(
    `INSERT INTO plans (id, user_id, token, title, mode, status, plan_path, started_at, ended_at, heartbeat_at, meta)
     VALUES (?, ?, ?, ?, ?, 'running', NULL, ?, NULL, ?, ?)`,
  ).run('rate-limit-rollout', 'user-1', 'token', 'Rate limiting rollout', 'watch', now, now, JSON.stringify({ tier: 'pro' }))
  const store = d1Of(db)
  await ensurePlanVersions(store)

  const before = await store.prepare(LATEST_PLAN_VERSION_SQL).bind('user-1').all<HostedPlanRow>()
  assert.equal(hostedProgress(before.results?.[0]?.meta), null)
  assert.equal(hostedDashboard(before.results ?? [], 'day', 'https://plan.example', now).plans[0]?.completionRatio, 0)

  await saveHostedProgress(store, 'rate-limit-rollout', {
    phaseTotal: 3,
    phaseDone: 1,
    interactionTotal: 4,
    interactionDone: 1,
    completionRatio: 36,
    completionState: 'in_progress',
  })
  const after = await store.prepare(LATEST_PLAN_VERSION_SQL).bind('user-1').all<HostedPlanRow>()
  const meta = JSON.parse(String(after.results?.[0]?.meta)) as Record<string, unknown>
  // Progress sits beside the keys already on the row.
  assert.equal(meta.tier, 'pro')
  const row = hostedDashboard(after.results ?? [], 'day', 'https://plan.example', now).plans[0]
  assert.equal(row?.completionRatio, 36)
  assert.equal(row?.completionState, 'in_progress')
  assert.equal(row?.phaseDone, 1)
  assert.equal(row?.interactionTotal, 4)

  // Saved "no progress" counts as measured, so the dashboard does not measure it again.
  await saveHostedProgress(store, 'rate-limit-rollout', NO_PROGRESS)
  const zero = await store.prepare(LATEST_PLAN_VERSION_SQL).bind('user-1').all<HostedPlanRow>()
  assert.deepEqual(hostedProgress(zero.results?.[0]?.meta), NO_PROGRESS)
  // A row with bad values is clamped or ignored.
  assert.deepEqual(hostedProgress(JSON.stringify({ completionState: 'complete', completionRatio: 400, phaseDone: -2 })), {
    ...NO_PROGRESS,
    completionState: 'complete',
    completionRatio: 100,
    phaseDone: 0,
  })
  assert.equal(hostedProgress(JSON.stringify({ completionState: 'nope', completionRatio: 10 })), null)
})

test('serving an existing plan opens it again', () => {
  const db = new Database(':memory:')
  const sql = sqlOf(db)
  initPlan(sql, { token: 'plan-token', title: 'Demo', mode: 'watch', tier: 'free', source: '# Draft\n' })
  putSource(sql, { markdown: '# Demo\n', revision: 0 })
  closePlan(sql)
  const again = initPlan(sql, { token: 'plan-token', title: 'Cloud showcase', mode: 'watch', tier: 'pro', source: '# Cloud showcase\n' })
  const view = planView(sql)
  assert.equal(again.revision, 1)
  assert.equal(view.closed, false)
  assert.equal(view.title, 'Cloud showcase')
  assert.equal(view.mode, 'watch')
  assert.equal(view.tier, 'pro')
  assert.equal(view.source, '# Demo\n')
  assert.throws(
    () => initPlan(sql, { token: 'other-token', title: 'Cloud showcase', mode: 'watch', tier: 'pro', source: '# Cloud showcase\n' }),
    /already hosted/,
  )
})

test('an unchanged upload keeps the revision, and a change tells pages the new one', () => {
  const db = new Database(':memory:')
  const sql = sqlOf(db)
  initPlan(sql, { token: 'plan-token', title: 'Demo', mode: 'watch', tier: 'free', source: '# Demo\n' })
  const same = putSource(sql, { markdown: '# Demo\n', revision: 0 })
  assert.equal(same.revision, 0)
  assert.deepEqual(same.outbound, [])
  const changed = putSource(sql, { markdown: '# Demo v2\n', revision: 0 })
  assert.equal(changed.revision, 1)
  assert.equal((changed.outbound[0]?.data as { revision?: number }).revision, 1)
})

test('an execution start or stop sends the moved revision to pages', async () => {
  const db = new Database(':memory:')
  const sql = sqlOf(db)
  initPlan(sql, { token: 'plan-token', title: 'Demo', mode: 'watch', tier: 'free', source: '# Demo\n' })
  const started = putExecution(sql, { active: true })
  assert.equal((started.outbound[0]?.data as { revision?: number }).revision, 1)
  assert.equal((await liveExecution(sql)).revision, 1)
  putExecution(sql, { active: false })
  assert.equal((await liveExecution(sql)).revision, 2)
})

test('addressing marks a comment in progress, and address resolves it', () => {
  const db = new Database(':memory:')
  const sql = sqlOf(db)
  initPlan(sql, { token: 'plan-token', title: 'Demo', mode: 'comment', tier: 'free', source: '# Demo\n' })
  const created = submitComment(sql, { partId: 'markdown:0', text: 'Seen?' }).body as { comment: { id: string } }
  const working = markCommentAddressing(sql, created.comment.id).body as { comment: { addressingAt: number | null; addressedAt: number | null } }
  assert.equal(typeof working.comment.addressingAt, 'number')
  assert.equal(working.comment.addressedAt, null)
  const done = addressComment(sql, created.comment.id, {}).body as { comment: { addressingAt: number | null; addressedAt: number | null } }
  assert.equal(done.comment.addressingAt, null)
  assert.equal(typeof done.comment.addressedAt, 'number')
})

test('a plan room that was never registered reports not hosted instead of a SQL error', () => {
  const db = new Database(':memory:')
  const sql = sqlOf(db)
  assert.equal(planHosted(sql), false)
  touchPlan(sql)
  initPlan(sql, { token: 'plan-token', title: 'Demo', mode: 'watch', tier: 'free', source: '# Demo\n' })
  assert.equal(planHosted(sql), true)
})

test('tier caps and viewer access', () => {
  assert.equal(agentSlotsFull('free', 1, false), true)
  assert.equal(agentSlotsFull('free', 1, true), false)
  assert.equal(agentSlotsFull('pro', 9, false), false)
  assert.equal(agentSlotsFull('pro', 10, false), true)
  assert.equal(allows('viewer', 'register'), false)
  assert.equal(allows('viewer', 'submit'), true)
  assert.equal(allows('account', 'register'), true)
  assert.equal(allows('plan', 'upload'), true)
  assert.equal(allows(null, 'read'), false)
})

test('serve --cloud uploads with the account and plan bearers and does not start the registry', async () => {
  const home = await mkdtemp(join(tmpdir(), 'living-plan-cloud-'))
  let revision = 0
  let registerAuth = ''
  let uploadAuth = ''
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request, bunServer) {
      const url = new URL(request.url)
      if (request.headers.get('upgrade') === 'websocket') {
        if (request.headers.get('authorization') !== 'Bearer plan-token') return new Response('Sign in required', { status: 401 })
        bunServer.upgrade(request)
        return undefined
      }
      if (url.pathname === '/api/plans' && request.method === 'POST') {
        registerAuth = request.headers.get('authorization') ?? ''
        const id = 'plan_12345678'
        return Response.json({
          plan: { id, url: `http://127.0.0.1:${bunServer.port}/plans/${id}/`, token: 'plan-token', mode: 'watch' },
          revision: 0,
        })
      }
      if (url.pathname.endsWith('/source') && request.method === 'PUT') {
        uploadAuth = request.headers.get('authorization') ?? ''
        const body = (await request.json()) as { revision: number }
        if (body.revision !== revision) return Response.json({ revision }, { status: 409 })
        revision += 1
        return Response.json({ revision })
      }
      if (request.method === 'PUT') return Response.json({ ok: true })
      if (url.pathname.endsWith('/ack') && request.method === 'POST') return Response.json({ ok: true, delivered: ['evt_1'] })
      return new Response('Not found', { status: 404 })
    },
    websocket: {
      open(socket) {
        socket.send(
          JSON.stringify({
            event: 'hello',
            data: {
              pending: [
                {
                  id: 'evt_1',
                  seq: 1,
                  event: 'interaction',
                  data: { kind: 'choice', id: 'choice', optionId: 'a', label: 'A' },
                  createdAt: 1,
                  deliveredAt: null,
                },
              ],
            },
          }),
        )
      },
      message() {},
    },
  })
  await writeFile(
    join(home, 'cloud.json'),
    JSON.stringify({ account: { baseUrl: `http://127.0.0.1:${server.port}`, token: 'account-token' }, plans: {} }),
  )
  const plan = join(home, 'demo.plan.md')
  await writeFile(plan, '# Demo\n')
  const child = spawn(process.execPath, [entry, 'serve', plan, '--cloud', '--no-open'], {
    env: { ...process.env, LIVE_PLAN_HOME: home, HOME: home },
  })
  let stdout = ''
  child.stdout?.on('data', (chunk) => {
    stdout += String(chunk)
  })
  const code = await new Promise<number>((resolveExit, reject) => {
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`timed out\n${stdout}`))
    }, 8_000)
    child.on('exit', (exitCode) => {
      clearTimeout(timer)
      resolveExit(exitCode ?? 1)
    })
  })
  server.stop(true)
  assert.equal(code, 0)
  assert.equal(registerAuth, 'Bearer account-token')
  assert.equal(uploadAuth, 'Bearer plan-token')
  assert.match(stdout, /"event":"interaction"/)
  assert.equal(await readRegistryLock(home), null)
  const stored = cloudIdInSource(await readFile(plan, 'utf8'))
  assert.equal(stored, 'plan_12345678')
  await rm(home, { recursive: true, force: true })
})

test('serve --cloud without a session does not start the registry', async () => {
  const home = await mkdtemp(join(tmpdir(), 'living-plan-cloud-'))
  const plan = join(home, 'demo.plan.md')
  await writeFile(plan, '# Demo\n')
  const child = spawn(process.execPath, [entry, 'serve', plan, '--cloud', '--no-open'], {
    env: { ...process.env, LIVE_PLAN_HOME: home, HOME: home },
  })
  let stderr = ''
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk)
  })
  const code = await new Promise<number>((resolveExit) => {
    child.on('exit', (exitCode) => resolveExit(exitCode ?? 1))
  })
  assert.equal(code, 1)
  assert.match(stderr, /account login/)
  assert.equal(await readRegistryLock(home), null)
  await rm(home, { recursive: true, force: true })
})

test('account login prints the sign-in link and saves the session from its callback', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-login-'))
  const child = spawn(process.execPath, [entry, 'account', 'login', '--url', 'https://plan.example', '--no-open'], {
    env: { ...process.env, LIVE_PLAN_HOME: home, HOME: home },
  })
  let stdout = ''
  const link = await new Promise<URL>((resolveLink, reject) => {
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
      const match = stdout.match(/https:\/\/plan\.example\/login\?\S+/)
      if (match) resolveLink(new URL(match[0]))
    })
    child.on('exit', () => reject(new Error(`login exited before printing a link: ${stdout}`)))
  })
  assert.match(stdout, /sign up/i)
  const callback = link.searchParams.get('cli')
  assert.ok(callback)
  const exited = new Promise<number>((resolveExit) => child.on('exit', (code) => resolveExit(code ?? 1)))
  const reply = await fetch(`${callback}?token=account-token`)
  assert.equal(reply.status, 200)
  assert.equal(await exited, 0)
  assert.match(stdout, /Signed in to https:\/\/plan\.example/)
  const saved = JSON.parse(await readFile(join(home, 'cloud.json'), 'utf8'))
  assert.deepEqual(saved.account, { baseUrl: 'https://plan.example', token: 'account-token' })
  await rm(home, { recursive: true, force: true })
})

test('serve --cloud rejects --no-registry', async () => {
  const home = await mkdtemp(join(tmpdir(), 'living-plan-cloud-'))
  const plan = join(home, 'demo.plan.md')
  await writeFile(plan, '# Demo\n')
  await writeFile(join(home, 'cloud.json'), JSON.stringify({ account: { baseUrl: 'http://127.0.0.1:9', token: 'account-token' }, plans: {} }))
  const child = spawn(process.execPath, [entry, 'serve', plan, '--cloud', '--no-registry', '--no-open'], {
    env: { ...process.env, LIVE_PLAN_HOME: home, HOME: home },
  })
  const code = await new Promise<number>((resolveExit) => {
    child.on('exit', (exitCode) => resolveExit(exitCode ?? 1))
  })
  assert.equal(code, 1)
  assert.equal(await readRegistryLock(home), null)
  await rm(home, { recursive: true, force: true })
})

test('plan room execution read includes the expected workflow and the run state', async () => {
  const db = new Database(':memory:')
  const sql = sqlOf(db)
  const source = readFileSync(fileURLToPath(new URL('../examples/rate-limit.plan.md', import.meta.url)), 'utf8')
  initPlan(sql, { token: 'plan-token', title: 'Demo', mode: 'watch', tier: 'free', source })
  const idle = await executionView(sql)
  assert.equal(idle.active, false)
  assert.ok(idle.planned && idle.planned.nodes.length > 0)
  putExecution(sql, { active: true, step: 'Build' })
  const running = await executionView(sql)
  assert.equal(running.active, true)
  assert.equal(running.step, 'Build')
  assert.ok(running.planned)
})

test('the hosted dashboard leaves out plans deleted from it', () => {
  const now = Date.UTC(2026, 9, 30, 18, 0, 0)
  const row = (id: string, meta: string) => ({
    id,
    title: id,
    mode: 'watch',
    ended_at: null,
    started_at: now - 60_000,
    version_seq: null,
    version_title: null,
    version_at: null,
    meta,
  })
  const payload = hostedDashboard(
    [row('kept1234', '{}'), row('gone1234', JSON.stringify({ deletedAt: now - 1000 }))],
    'day',
    'https://plans.example',
    now,
  )
  assert.deepEqual(payload.plans.map((plan) => plan.id), ['kept1234'])
  assert.equal(payload.summary.plans, 1)
})

function runCli(args: string[], home: string, input?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, [entry, ...args], { env: { ...process.env, LIVE_PLAN_HOME: home, HOME: home } })
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk) => (stdout += String(chunk)))
  child.stderr?.on('data', (chunk) => (stderr += String(chunk)))
  if (input != null) child.stdin?.end(input)
  else child.stdin?.end()
  return new Promise((resolveRun) => child.on('exit', (code) => resolveRun({ code: code ?? 1, stdout, stderr })))
}

test('account login --headless prints the token page and exits without waiting', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-headless-'))
  const run = await runCli(['account', 'login', '--url', 'https://plan.example/dashboard', '--headless'], home)
  assert.equal(run.code, 0)
  assert.match(run.stdout, /https:\/\/plan\.example\/cli-token\n/)
  assert.match(run.stdout, /sign up/i)
  assert.match(run.stdout, /--token <token>/)
  await assert.rejects(readFile(join(home, 'cloud.json'), 'utf8'))
  await rm(home, { recursive: true, force: true })
})

test('account login --token checks the token with the host and saves it', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-token-'))
  const seen: string[] = []
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      const auth = request.headers.get('authorization') ?? ''
      seen.push(`${new URL(request.url).pathname} ${auth}`)
      if (auth !== 'Bearer good-token') return new Response('Sign in required', { status: 401 })
      return Response.json({ user: { email: 'person@example.com' } })
    },
  })
  const base = `http://127.0.0.1:${server.port}`
  try {
    const bad = await runCli(['account', 'login', '--url', base, '--token', 'stale-token'], home)
    assert.equal(bad.code, 1)
    assert.match(bad.stderr, /not valid or has expired/)
    assert.match(bad.stderr, new RegExp(`${base}/cli-token`))
    await assert.rejects(readFile(join(home, 'cloud.json'), 'utf8'))

    const good = await runCli(['account', 'login', '--url', base, '--token', 'good-token'], home)
    assert.equal(good.code, 0, good.stderr)
    assert.match(good.stdout, /Signed in to .* as person@example\.com/)
    const saved = JSON.parse(await readFile(join(home, 'cloud.json'), 'utf8'))
    assert.deepEqual(saved.account, { baseUrl: base, token: 'good-token' })

    await rm(join(home, 'cloud.json'))
    const piped = await runCli(['account', 'login', '--url', base, '--token', '-'], home, 'good-token\n')
    assert.equal(piped.code, 0, piped.stderr)
    assert.equal(JSON.parse(await readFile(join(home, 'cloud.json'), 'utf8')).account.token, 'good-token')

    assert.deepEqual(seen, [
      '/api/account Bearer stale-token',
      '/api/account Bearer good-token',
      '/api/account Bearer good-token',
    ])
  } finally {
    server.stop(true)
    await rm(home, { recursive: true, force: true })
  }
})

test('account login --token without a value or with --headless is a usage error', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-token-usage-'))
  const missing = await runCli(['account', 'login', '--url', 'https://plan.example', '--token'], home)
  assert.equal(missing.code, 1)
  assert.match(missing.stderr, /Pass the token after --token/)
  const both = await runCli(['account', 'login', '--url', 'https://plan.example', '--headless', '--token', 'abc'], home)
  assert.equal(both.code, 1)
  assert.match(both.stderr, /--headless/)
  await rm(home, { recursive: true, force: true })
})
