import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Database } from 'bun:sqlite'
import { Elysia } from 'elysia'
import { createHostApp, handleHostRequest, hostedPlanPage, hostedPlanVersionPage, type HostEnv } from '../src/host/app.ts'
import { publishPlanVersion } from '../src/host/planVersions.ts'
import { rehydrateRequest } from '../src/host/rehydrateRequest.ts'

function env(): HostEnv {
  const statement = {
    bind() {
      return statement
    },
    async first() {
      return null
    },
    async all() {
      return { results: [], meta: { changes: 0 } }
    },
    async run() {
      return { success: true, meta: { changes: 0 } }
    },
  }
  return {
    DB: { prepare: () => statement } as unknown as D1Database,
    PLANS: {
      idFromName: () => 'id',
      get: () => ({ fetch: async () => new Response('missing', { status: 404 }) }),
    },
    BETTER_AUTH_SECRET: 'local-dev-secret-at-least-32-characters',
  }
}

test('hosted HTTP routes are an Elysia app', async () => {
  const app = createHostApp(env())
  const health = await app.fetch(new Request('http://127.0.0.1/api/health'))
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { ok: true })
  const missing = await app.fetch(new Request('http://127.0.0.1/missing'))
  assert.equal(missing.status, 404)
  assert.equal(await missing.text(), 'Not found')
})

test('a JSON route can read the body after Elysia parses it', async () => {
  const app = new Elysia({ strictPath: true, aot: false })
    .onBeforeHandle((context) => {
      rehydrateRequest(context)
    })
    .post('/echo', async ({ request }) => request.json())
  const response = await app.fetch(
    new Request('http://127.0.0.1/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c' }),
    }),
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { email: 'a@b.c' })
})

/** Enough of D1 for Better Auth to pass its schema check and reach the origin middleware. */
function authDatabase(sqlite = new Database(':memory:')): D1Database {
  sqlite.exec(readFileSync(new URL('../src/migrations/0001_auth.sql', import.meta.url), 'utf8'))
  const statementFor = (sql: string) => {
    const statement = sqlite.prepare(sql)
    const run = (...values: unknown[]) => ({
      async first<T>() {
        return (statement.get(...(values as never[])) as T | null) ?? null
      },
      async all<T>() {
        return {
          results: statement.all(...(values as never[])) as T[],
          meta: { changes: 0, last_row_id: 0, duration: 0 },
        }
      },
      async run() {
        statement.run(...(values as never[]))
        return { success: true, meta: { changes: sqlite.changes, last_row_id: 0, duration: 0 } }
      },
    })
    return { ...run(), bind: (...values: unknown[]) => run(...values) }
  }
  return {
    prepare: (sql: string) => statementFor(sql),
    async batch(statements: Array<{ all(): Promise<unknown> }>) {
      return Promise.all(statements.map((statement) => statement.all()))
    },
    async exec(sql: string) {
      sqlite.exec(sql)
      return { count: 0, duration: 0 }
    },
  } as unknown as D1Database
}

test('preview sign-in is not rejected as an invalid origin', async () => {
  const preview = 'https://alias-visual-living-plan.mcalderon-code.workers.dev'
  const signIn = () =>
    new Request(`${preview}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: preview },
      body: JSON.stringify({ email: 'person@example.com', password: 'not-a-real-password' }),
    })
  const rejected = await handleHostRequest(signIn(), { ...env(), DB: authDatabase(), PUBLIC_URL: 'https://plan.logspace.qzz.io' })
  assert.equal(rejected.status, 403)
  assert.match(await rejected.text(), /INVALID_ORIGIN/)

  const accepted = await handleHostRequest(signIn(), {
    ...env(),
    DB: authDatabase(),
    PUBLIC_URL: 'https://plan.logspace.qzz.io',
    TRUSTED_ORIGINS: 'https://*-visual-living-plan.mcalderon-code.workers.dev',
  })
  assert.notEqual(accepted.status, 403)
  assert.doesNotMatch(await accepted.text(), /INVALID_ORIGIN/)
})

test('account creation reads the JSON body before the database adapter runs', async () => {
  await assert.rejects(
    () =>
      handleHostRequest(
        new Request('http://127.0.0.1/api/auth/sign-up/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: 'signup-check@example.com',
            password: 'not-a-real-password',
            name: 'Signup Check',
          }),
        }),
        env(),
      ),
    /Failed to initialize database adapter/,
  )
})

test('only the owning account opens a hosted plan', async () => {
  const sqlite = new Database(':memory:')
  const db = authDatabase(sqlite)
  const now = new Date().toISOString()
  const later = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  for (const id of ['owner', 'other']) {
    sqlite.run('INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', [id, id, `${id}@example.com`, now, now])
    sqlite.run('INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)', [
      `session-${id}`,
      later,
      `${id}-token`,
      now,
      now,
      id,
    ])
  }
  sqlite.run(`INSERT INTO plans (id, user_id, token, mode, tier, created_at) VALUES ('plan1234', 'owner', 'plan-token', 'watch', 'free', 0)`)
  const actors: string[] = []
  const hostEnv: HostEnv = {
    ...env(),
    DB: db,
    PLANS: {
      idFromName: () => 'id',
      get: () => ({
        fetch: async (request: Request) => {
          const actor = request.headers.get('x-living-plan-actor') ?? ''
          actors.push(actor)
          if (!actor) return new Response('Sign in required', { status: 401 })
          return Response.json({ title: 'Demo', source: '# Demo\n', mode: 'watch', responses: {}, comments: [], review: null, theme: null })
        },
      }),
    },
  }
  const page = (headers: Record<string, string>) =>
    hostedPlanPage(new Request('https://plans.example/plans/plan1234/', { headers }), hostEnv, 'plan1234')

  assert.equal((await page({})).status, 401)
  assert.equal((await page({ cookie: 'living_plan_view=plan1234.old-signature' })).status, 401)
  assert.equal((await page({ authorization: 'Bearer other-token' })).status, 403)
  assert.equal((await page({ authorization: 'Bearer owner-token' })).status, 200)

  const app = createHostApp(hostEnv)
  const submit = await app.fetch(
    new Request('https://plans.example/plans/plan1234/api/comments', {
      method: 'POST',
      headers: { authorization: 'Bearer other-token', 'content-type': 'application/json' },
      body: '{}',
    }),
  )
  assert.equal(submit.status, 401)
  assert.deepEqual(actors, ['account', ''])

  const oldLink = await app.fetch(new Request('https://plans.example/plans/plan1234/view/old-signature'))
  assert.equal(oldLink.status, 302)
  assert.equal(oldLink.headers.get('location'), '/plans/plan1234/')
  assert.match(oldLink.headers.get('set-cookie') ?? '', /living_plan_view=;.*Max-Age=0/)
  assert.equal((await app.fetch(new Request('https://plans.example/plans/plan1234/share'))).status, 401)
})

test('a saved version is a page for the owner and its raw file is a separate download', async () => {
  const sqlite = new Database(':memory:')
  const db = authDatabase(sqlite)
  const now = new Date().toISOString()
  const later = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  for (const id of ['owner', 'other']) {
    sqlite.run('INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', [id, id, `${id}@example.com`, now, now])
    sqlite.run('INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)', [
      `session-${id}`,
      later,
      `${id}-token`,
      now,
      now,
      id,
    ])
  }
  sqlite.run(`INSERT INTO plans (id, user_id, token, mode, tier, created_at) VALUES ('plan1234', 'owner', 'plan-token', 'watch', 'free', 0)`)
  await publishPlanVersion(db, { planId: 'plan1234', userId: 'owner', title: 'First', source: '# First\n', now: 10 })
  await publishPlanVersion(db, { planId: 'plan1234', userId: 'owner', title: 'Second', source: '# Second\n', now: 20 })
  const hostEnv: HostEnv = { ...env(), DB: db }
  const page = (seq: string, token: string) =>
    hostedPlanVersionPage(
      new Request(`https://plans.example/plans/plan1234/versions/${seq}`, { headers: { authorization: `Bearer ${token}` } }),
      hostEnv,
      'plan1234',
      seq,
    )

  const first = await page('1', 'owner-token')
  assert.equal(first.status, 200)
  const body = (await first.json()) as { seq: number; title: string; source: string; createdAt: number }
  assert.equal(body.seq, 1)
  assert.equal(body.title, 'First')
  assert.equal(body.source, '# First\n')
  assert.equal(body.createdAt, 10)
  assert.equal((await page('1', 'other-token')).status, 401)
  assert.equal((await page('9', 'owner-token')).status, 404)
  assert.equal((await page('abc', 'owner-token')).status, 404)

  const app = createHostApp(hostEnv)
  const raw = await app.fetch(
    new Request('https://plans.example/plans/plan1234/versions/2/document', { headers: { authorization: 'Bearer owner-token' } }),
  )
  assert.equal(raw.status, 200)
  assert.match(raw.headers.get('content-type') ?? '', /text\/markdown/)
  assert.equal(await raw.text(), '# Second\n')
})

test('the account appearance is a read of its own for plan pages', async () => {
  const sqlite = new Database(':memory:')
  const db = authDatabase(sqlite)
  const now = new Date().toISOString()
  const later = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  sqlite.run('INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', ['owner', 'owner', 'owner@example.com', now, now])
  sqlite.run('INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)', [
    'session-owner',
    later,
    'owner-token',
    now,
    now,
    'owner',
  ])
  const app = createHostApp({ ...env(), DB: db })
  const read = (headers: Record<string, string>) => app.fetch(new Request('https://plans.example/api/account/settings', { headers }))
  assert.equal((await read({})).status, 401)
  const saved = await app.fetch(
    new Request('https://plans.example/api/account/settings', {
      method: 'PUT',
      headers: { authorization: 'Bearer owner-token', 'content-type': 'application/json' },
      body: JSON.stringify({ pageWidth: 'wide', wrapCode: true }),
    }),
  )
  assert.equal(saved.status, 200)
  const response = await read({ authorization: 'Bearer owner-token' })
  assert.equal(response.status, 200)
  const body = (await response.json()) as { settings: { pageWidth: string; wrapCode: boolean; accent: string } }
  assert.equal(body.settings.pageWidth, 'wide')
  assert.equal(body.settings.wrapCode, true)
  assert.match(body.settings.accent, /^#/)
})

test('account usage counts the saved versions of each owned plan in bytes', async () => {
  const sqlite = new Database(':memory:')
  const db = authDatabase(sqlite)
  for (const file of ['0002_user_settings.sql', '0003_plan_versions.sql', '0004_one_schema.sql']) {
    sqlite.exec(readFileSync(new URL(`../src/migrations/${file}`, import.meta.url), 'utf8'))
  }
  const now = new Date().toISOString()
  const later = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  for (const id of ['owner', 'other']) {
    sqlite.run('INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', [id, id, `${id}@example.com`, now, now])
    sqlite.run('INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)', [
      `session-${id}`,
      later,
      `${id}-token`,
      now,
      now,
      id,
    ])
  }
  const plan = (id: string, user: string, status: string, startedAt: number) =>
    sqlite.run(
      `INSERT INTO plans (id, user_id, token, title, mode, status, started_at, heartbeat_at) VALUES (?, ?, 't', ?, 'watch', ?, ?, ?)`,
      [id, user, `Plan ${id}`, status, startedAt, startedAt],
    )
  plan('plan-small', 'owner', 'running', 1)
  plan('plan-large', 'owner', 'executed', 2)
  plan('plan-empty', 'owner', 'running', 3)
  plan('plan-other', 'other', 'running', 4)
  await publishPlanVersion(db, { planId: 'plan-small', userId: 'owner', title: 'S', source: 'é', now: 10 })
  await publishPlanVersion(db, { planId: 'plan-large', userId: 'owner', title: 'L', source: '1234567890', now: 11 })
  await publishPlanVersion(db, { planId: 'plan-large', userId: 'owner', title: 'L', source: '12345', now: 12 })
  await publishPlanVersion(db, { planId: 'plan-other', userId: 'other', title: 'O', source: 'x'.repeat(500), now: 13 })

  const app = createHostApp({ ...env(), DB: db })
  const read = (token?: string) =>
    app.fetch(
      new Request('https://plans.example/api/account/usage', {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    )
  assert.equal((await read()).status, 401)
  const response = await read('owner-token')
  assert.equal(response.status, 200)
  const usage = (await response.json()) as {
    tier: string
    activePlans: number
    activeCap: number
    versionLimit: number
    plans: number
    versions: number
    bytes: number
    byPlan: Array<{ id: string; versions: number; bytes: number }>
  }
  assert.equal(usage.tier, 'free')
  assert.equal(usage.activePlans, 2)
  assert.equal(usage.activeCap, 1)
  assert.equal(usage.versionLimit, 10)
  assert.equal(usage.plans, 3)
  assert.equal(usage.versions, 3)
  // Title and body bytes. "é" is two bytes in UTF-8.
  assert.equal(usage.bytes, 1 + 10 + 1 + 5 + 1 + 2)
  assert.deepEqual(
    usage.byPlan.map((row) => [row.id, row.versions, row.bytes]),
    [
      ['plan-large', 2, 17],
      ['plan-small', 1, 3],
      ['plan-empty', 0, 0],
    ],
  )
})

test('a signed-in account mints a separate terminal token that the host accepts as a bearer', async () => {
  const sqlite = new Database(':memory:')
  const db = authDatabase(sqlite)
  const now = new Date().toISOString()
  const later = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  sqlite.run('INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', ['owner', 'Owner', 'owner@example.com', now, now])
  sqlite.run('INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId) VALUES (?, ?, ?, ?, ?, ?)', [
    'session-owner',
    later,
    'browser-token',
    now,
    now,
    'owner',
  ])
  const app = createHostApp({ ...env(), DB: db })
  const mint = (headers: Record<string, string>) =>
    app.fetch(new Request('https://plans.example/api/account/cli-token', { method: 'POST', headers }))

  assert.equal((await mint({})).status, 401)
  assert.equal((await mint({ authorization: 'Bearer not-a-session' })).status, 401)

  const minted = await mint({ authorization: 'Bearer browser-token' })
  assert.equal(minted.status, 200)
  const body = (await minted.json()) as { token: string; url: string; expiresAt: string }
  assert.match(body.token, /^[0-9a-f]{64}$/)
  assert.notEqual(body.token, 'browser-token')
  assert.equal(body.url, 'https://plans.example')
  const days = (Date.parse(body.expiresAt) - Date.now()) / 86_400_000
  assert.ok(days > 29 && days <= 30, `expires in ${days} days`)

  const row = sqlite.query('SELECT userId, userAgent FROM session WHERE token = ?').get(body.token) as {
    userId: string
    userAgent: string
  }
  assert.deepEqual(row, { userId: 'owner', userAgent: 'live-plan CLI' })

  // Signing the browser out leaves the terminal token working.
  sqlite.run('DELETE FROM session WHERE token = ?', ['browser-token'])
  assert.equal((await mint({ authorization: `Bearer ${body.token}` })).status, 200)
})

test('a forwarded plan read keeps its query, so search reaches the plan object intact', async () => {
  const seen: string[] = []
  const hostEnv: HostEnv = {
    ...env(),
    DB: authDatabase(new Database(':memory:')),
    PLANS: {
      idFromName: () => 'id',
      get: () => ({
        fetch: async (request: Request) => {
          seen.push(request.url)
          return Response.json({ ok: true })
        },
      }),
    },
  }
  const response = await createHostApp(hostEnv).fetch(
    new Request('https://plans.example/plans/plan1234/api/search?q=redis+%22fail+open%22&version=all'),
  )
  assert.equal(response.status, 200)
  const forwarded = new URL(seen[0] ?? '')
  assert.equal(forwarded.pathname, '/api/search')
  assert.equal(forwarded.searchParams.get('q'), 'redis "fail open"')
  assert.equal(forwarded.searchParams.get('version'), 'all')
})
