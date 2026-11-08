import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Database } from 'bun:sqlite'
import { createHostApp, type HostEnv } from '../src/host/app.ts'
import { ensurePlanVersions, readPlanVersion } from '../src/host/planVersions.ts'

const BASE = 'https://living-plan.example'
const PLAN = 'abcdefgh12345678'

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
            return { success: true, meta: { changes: 1 } }
          },
          async all<T>() {
            return { results: statement.all(...(values as never[])) as T[] }
          },
        }
      }
      return { ...run(), bind: (...values: unknown[]) => run(...values) }
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      return Promise.all(statements.map((statement) => statement.run()))
    },
  } as unknown as D1Database
}

async function fixture() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`CREATE TABLE plans (id TEXT PRIMARY KEY, user_id TEXT, token TEXT, title TEXT, mode TEXT, status TEXT, meta TEXT, started_at INTEGER, ended_at INTEGER)`)
  sqlite.exec(`CREATE TABLE user (id TEXT PRIMARY KEY, tier TEXT, email TEXT, name TEXT)`)
  sqlite.exec(`CREATE TABLE session (token TEXT, userId TEXT, expiresAt TEXT)`)
  sqlite.exec(`INSERT INTO plans (id, user_id, title, mode, status, meta) VALUES ('${PLAN}', 'owner', 'Old title', 'watch', 'running', '{}')`)
  sqlite.exec(`INSERT INTO user (id, tier) VALUES ('owner', 'free')`)
  const db = d1Of(sqlite)
  await ensurePlanVersions(db)
  const calls: Array<{ path: string; actor: string | null; body: string }> = []
  const env: HostEnv = {
    DB: db,
    PLANS: {
      idFromName: () => 'id',
      get: () => ({
        fetch: async (request: Request) => {
          const body = request.method === 'PUT' ? await request.text() : ''
          calls.push({ path: new URL(request.url).pathname, actor: request.headers.get('x-living-plan-actor'), body })
          if (new URL(request.url).pathname === '/api/plan-mdx/source') return Response.json({ revision: 2 })
          return Response.json({})
        },
      }),
    },
    BETTER_AUTH_SECRET: 'local-dev-secret-at-least-32-characters',
  }
  return { env, db, calls }
}

function authAs(userId: string | null) {
  const session = userId ? { user: { id: userId, email: `${userId}@example.com` }, session: { token: 't' } } : null
  return () => ({ api: { getSession: async () => session } }) as never
}

const source = '---\ntitle: Edited on the page\n---\n# Plan\n\nNew text.\n'

function put(body: unknown): Request {
  return new Request(`${BASE}/plans/${PLAN}/api/plan-mdx/source`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('the owner publishes a page edit: the plan object takes it and a version is saved', async () => {
  const { env, db, calls } = await fixture()
  const app = createHostApp(env, { auth: authAs('owner') })
  const response = await app.fetch(put({ base: '# Plan\n', source }))
  assert.equal(response.status, 200)
  const edit = calls.find((call) => call.path === '/api/plan-mdx/source')
  assert.equal(edit?.actor, 'account')
  assert.deepEqual(JSON.parse(edit?.body ?? '{}'), { base: '# Plan\n', source, title: 'Edited on the page' })
  const version = await readPlanVersion(db, PLAN, 'latest')
  assert.equal(version?.source, source)
  assert.equal(version?.title, 'Edited on the page')
})

test('another account and a signed-out page cannot publish an edit', async () => {
  for (const user of ['someone-else', null]) {
    const { env, calls } = await fixture()
    const app = createHostApp(env, { auth: authAs(user) })
    const response = await app.fetch(put({ base: '# Plan\n', source }))
    assert.equal(response.status, 401, String(user))
    assert.equal(calls.length, 0)
  }
})

test('the plan bearer cannot publish a page edit', async () => {
  const { env, calls } = await fixture()
  const app = createHostApp(env, { auth: authAs(null) })
  const request = put({ base: '# Plan\n', source })
  request.headers.set('authorization', 'Bearer plan-token')
  const response = await app.fetch(request)
  assert.equal(response.status, 401)
  assert.equal(calls.length, 0)
})
