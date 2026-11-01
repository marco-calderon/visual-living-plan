import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHostApp, type HostEnv } from '../src/host/app.ts'

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
