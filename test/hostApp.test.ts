import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Database } from 'bun:sqlite'
import { Elysia } from 'elysia'
import { createHostApp, handleHostRequest, type HostEnv } from '../src/host/app.ts'
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
function authDatabase(): D1Database {
  const sqlite = new Database(':memory:')
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
