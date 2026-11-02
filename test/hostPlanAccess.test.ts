import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allows } from '../src/host/access.ts'
import { createHostApp, type HostEnv } from '../src/host/app.ts'

const BASE = 'https://living-plan.example'
const PLAN = 'abcdefgh12345678'

type Fixture = { env: HostEnv; writes: string[]; objectCalls: Array<{ path: string; actor: string | null }> }

/** D1 says the plan belongs to `owner`. The stand-in Durable Object accepts only `Bearer plan-token` or the account actor. */
function fixture(): Fixture {
  const writes: string[] = []
  const objectCalls: Array<{ path: string; actor: string | null }> = []
  const statement = (sql: string) => {
    const bound = {
      bind: () => bound,
      async first() {
        return sql.startsWith('SELECT user_id') ? { user_id: 'owner' } : null
      },
      async all() {
        return { results: [], meta: { changes: 0 } }
      },
      async run() {
        writes.push(sql)
        return { success: true, meta: { changes: 1 } }
      },
    }
    return bound
  }
  const env: HostEnv = {
    DB: { prepare: (sql: string) => statement(sql) } as unknown as D1Database,
    PLANS: {
      idFromName: () => 'id',
      get: () => ({
        fetch: async (request: Request) => {
          const actor = request.headers.get('x-living-plan-actor')
          objectCalls.push({ path: new URL(request.url).pathname, actor })
          const bearer = request.headers.get('authorization') === 'Bearer plan-token'
          if (bearer || actor === 'account') return Response.json({ ok: true })
          return new Response('Sign in required', { status: 401 })
        },
      }),
    },
    BETTER_AUTH_SECRET: 'local-dev-secret-at-least-32-characters',
  }
  return { env, writes, objectCalls }
}

function authAs(userId: string | null) {
  const session = userId ? { user: { id: userId, email: `${userId}@example.com` }, session: { token: 't' } } : null
  return () => ({ api: { getSession: async () => session } }) as never
}

test('a junk bearer cannot close someone else’s hosted plan', async () => {
  const { env, writes } = fixture()
  const app = createHostApp(env, { auth: authAs(null) })
  const response = await app.fetch(
    new Request(`${BASE}/plans/${PLAN}`, { method: 'DELETE', headers: { authorization: 'Bearer junk' } }),
  )
  assert.equal(response.status, 401)
  assert.deepEqual(writes, [])
})

test('the plan bearer closes the plan and records it as executed', async () => {
  const { env, writes } = fixture()
  const app = createHostApp(env, { auth: authAs(null) })
  const response = await app.fetch(
    new Request(`${BASE}/plans/${PLAN}`, { method: 'DELETE', headers: { authorization: 'Bearer plan-token' } }),
  )
  assert.equal(response.status, 200)
  assert.equal(writes.length, 1)
  assert.match(writes[0] ?? '', /status = 'executed'/)
})

test('the owner closes the Durable Object, not only the catalog row', async () => {
  const { env, writes, objectCalls } = fixture()
  const app = createHostApp(env, { auth: authAs('owner') })
  const response = await app.fetch(new Request(`${BASE}/plans/${PLAN}`, { method: 'DELETE' }))
  assert.equal(response.status, 200)
  assert.deepEqual(objectCalls, [{ path: '/', actor: 'account' }])
  assert.equal(writes.length, 1)
  assert.equal(allows('account', 'close'), true)
  assert.equal(allows('viewer', 'close'), false)
})

test('another account cannot close the plan', async () => {
  const { env, writes } = fixture()
  const app = createHostApp(env, { auth: authAs('someone-else') })
  const response = await app.fetch(new Request(`${BASE}/plans/${PLAN}`, { method: 'DELETE' }))
  assert.equal(response.status, 401)
  assert.deepEqual(writes, [])
})

test('internal Durable Object routes are not reachable from outside', async () => {
  const { env, objectCalls } = fixture()
  const app = createHostApp(env, { auth: authAs(null) })
  const body = JSON.stringify({ token: 'attacker', title: 't', mode: 'watch', tier: 'business', source: '' })
  for (const path of ['/internal/init', '/api/../internal/init', '/%69nternal/init', '/INTERNAL/init', '/x/%2e%2e/internal/init']) {
    const response = await app.fetch(new Request(`${BASE}/plans/${PLAN}${path}`, { method: 'POST', body }))
    assert.equal(response.status, 404, path)
  }
  assert.deepEqual(objectCalls, [])
})
