import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Database } from 'bun:sqlite'
import { fileURLToPath } from 'node:url'
import { allows, planCapReached } from '../cloud/src/access.ts'
import { sessionFromToken } from '../cloud/src/auth.ts'
import { defaultAccountSettings, mergeAccountSettings, readAccountSettings, saveAccountSettings } from '../cloud/src/accountSettings.ts'
import { cloudAccountRoute, renderAccountPage, renderPlansDashboard, renderSettingsPage } from '../cloud/src/dashboardPage.ts'
import { hostedDashboard } from '../cloud/src/hostedDashboard.ts'
import { PLAN_VERSION_LIMIT, publishPlanVersion, readPlanVersion } from '../cloud/src/planVersions.ts'
import { renderCloudPage } from '../cloud/src/page.ts'
import {
  ackEvents,
  initPlan,
  pendingEvents,
  putSource,
  StaleRevision,
  submitInteraction,
  type PlanSql,
} from '../cloud/src/planRoom.ts'
import { hostedViewUrl, uploadSource } from '../src/cloudClient.ts'
import { renderDashboardPage } from '../src/dashboardPage.ts'
import { cloudIdInSource, sourceWithCloudId } from '../src/cloudFrontmatter.ts'
import { readRegistryLock, type RegistryLock } from '../src/registryLock.ts'
import { localServiceUrl, rewriteToBindUrl } from '../src/registryClient.ts'

const entry = fileURLToPath(new URL('../src/cli.ts', import.meta.url))

test('signed-in cloud pages split the dashboard, account, and settings', () => {
  const account = renderAccountPage({ email: 'person@example.com', name: 'Person', tier: 'free' })
  assert.match(account, /<h1>Account<\/h1>/)
  assert.match(account, /Signed in as person@example.com/)
  assert.match(account, /live-plan serve path\/to\/work\.plan\.md --cloud/)
  assert.match(account, /data-host-panel="cloud"/)
  assert.doesNotMatch(account, /Save on this host/)
  assert.doesNotMatch(account, /data-host-panel="local"/)
  assert.match(account, /--canvas:\s*#ffffff/)
  assert.doesNotMatch(account, /#f7f6f3/)

  const settings = renderSettingsPage(defaultAccountSettings())
  assert.match(settings, /<h1>Settings<\/h1>/)
  assert.match(settings, /Save on this host/)
  assert.doesNotMatch(settings, /<h1>Account<\/h1>/)

  const dashboard = renderPlansDashboard()
  assert.match(dashboard, /<h1>Control dashboard<\/h1>/)
  assert.match(dashboard, /data-period="day"/)
  assert.match(dashboard, /data-filter="running"/)
  assert.match(dashboard, /data-filter="executed"/)
  assert.match(dashboard, /data-filter="interrupted"/)
  assert.match(dashboard, /\/api\/account\/dashboard/)
  assert.match(dashboard, /data-plan-host="cloud"/)
  assert.match(dashboard, /href="\/account"/)
  assert.match(dashboard, /href="\/settings"/)
  assert.doesNotMatch(dashboard, /Save on this host/)

  assert.equal(cloudAccountRoute('/dashboard'), 'dashboard')
  assert.equal(cloudAccountRoute('/dashboard/'), 'dashboard')
  assert.equal(cloudAccountRoute('/account'), 'account')
  assert.equal(cloudAccountRoute('/settings/'), 'settings')
  assert.equal(cloudAccountRoute('/review'), 'redirect')
  assert.equal(cloudAccountRoute('/'), 'redirect')
  assert.equal(cloudAccountRoute('/plans/plan1234/'), null)
})

test('a hosted plan and a loopback plan show different panels', () => {
  const settings = { accent: '#1d4ed8', pageWidth: 'wide' as const, diffsTheme: 'soft', wrapCode: true }
  const assets = { planMdxHref: null, planMdxCss: [], selectorHref: null, selectorCss: [] }
  const hosted = renderCloudPage({
    basePath: '/plans/abc',
    title: 'Demo',
    source: '# Demo',
    mode: 'watch',
    responses: {},
    comments: [],
    review: null,
    accent: settings.accent,
    pageWidth: settings.pageWidth,
    diffsTheme: settings.diffsTheme,
    wrapCode: settings.wrapCode,
    owner: true,
    email: 'person@example.com',
    settings,
    assets,
  })
  assert.match(hosted, /data-host-panel="cloud"/)
  assert.match(hosted, /data-layout="wide"/)
  assert.match(hosted, /__LIVE_PLAN_HOST__ = "cloud"/)
  assert.match(hosted, /href="\/settings"/)
  assert.doesNotMatch(hosted, /data-account-settings/)
  assert.doesNotMatch(hosted, /data-host-panel="local"/)
  const viewer = renderCloudPage({ ...hostedInput(settings, assets), owner: false, email: '' })
  assert.match(viewer, /does not use this account/)
  assert.doesNotMatch(viewer, /data-account-settings/)
})

function hostedInput(
  settings: { accent: string; pageWidth: 'default' | 'wide' | 'full'; diffsTheme: string; wrapCode: boolean },
  assets: { planMdxHref: null; planMdxCss: string[]; selectorHref: null; selectorCss: string[] },
) {
  return {
    basePath: '/plans/abc',
    title: 'Demo',
    source: '# Demo',
    mode: 'watch',
    responses: {},
    comments: [],
    review: null,
    accent: settings.accent,
    pageWidth: settings.pageWidth,
    diffsTheme: settings.diffsTheme,
    wrapCode: settings.wrapCode,
    owner: true,
    email: 'person@example.com',
    settings,
    assets,
  }
}

test('a published cloud plan keeps the latest 10 documents', async () => {
  const db = new Database(':memory:')
  db.exec(await readFile(new URL('../cloud/migrations/0003_plan_versions.sql', import.meta.url), 'utf8'))
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

test('the hosted dashboard lists a stored plan the way the local dashboard does', () => {
  const now = Date.UTC(2026, 9, 30, 18, 0, 0)
  const payload = hostedDashboard(
    [
      {
        id: 'plan1234',
        title: 'Demo',
        mode: 'watch',
        closed_at: null,
        created_at: now - 60_000,
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
  assert.match(local, /registry's plans folder/)
  assert.match(local, /const apiPath = "\/api\/dashboard"/)
  assert.doesNotMatch(local, /api\/account\/dashboard/)
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

test('the opened cloud plan uses the signed view link', async () => {
  const previous = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    assert.equal(url.pathname, '/plans/plan1234/share')
    return Response.json({ url: 'https://plans.example/plans/plan1234/view/sig' })
  }) as typeof fetch
  try {
    assert.equal(
      await hostedViewUrl('https://plans.example/plans/plan1234/', 'account-token'),
      'https://plans.example/plans/plan1234/view/sig',
    )
  } finally {
    globalThis.fetch = previous
  }
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

test('tier caps and viewer access', () => {
  assert.equal(planCapReached('free', 1, false), true)
  assert.equal(planCapReached('free', 1, true), false)
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
