import assert from 'node:assert/strict'
import { test } from 'node:test'
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
