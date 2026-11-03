import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Database } from 'bun:sqlite'
import { seedPlanRoom, type HostEnv } from '../src/host/app.ts'
import { initPlan, planHosted, planView, type PlanSql } from '../src/host/planRoom.ts'

const PLAN = 'abcdefgh12345678'

function sqlOf(db: Database): PlanSql {
  return {
    exec(query, ...bindings) {
      const statement = db.query(query)
      if (query.trim().toLowerCase().startsWith('select')) {
        return { toArray: () => statement.all(...(bindings as never[])) as Array<Record<string, unknown>> }
      }
      statement.run(...(bindings as never[]))
      return { toArray: () => [] }
    },
  }
}

/** D1 holds the owner's session, the plan row, and one published version. The Durable Object starts empty, as on a Preview. */
function previewEnv(withVersion: boolean) {
  const room = sqlOf(new Database(':memory:'))
  const d1 = (sql: string) => {
    const bound = {
      bind: () => bound,
      async first() {
        if (sql.includes('FROM session JOIN user')) {
          return { token: 's', id: 'owner', email: 'owner@example.com', name: 'Owner', tier: 'free', expiresAt: '2999-01-01T00:00:00Z' }
        }
        if (sql.startsWith('SELECT user_id')) return { user_id: 'owner' }
        if (sql.startsWith('SELECT token')) return { token: 'plan-token', title: 'Old title', mode: 'watch', tier: 'free' }
        if (sql.includes('FROM plan_versions')) {
          return withVersion ? { seq: 2, title: 'Rollout', body: '# Rollout\n', created_at: 1 } : null
        }
        return null
      },
      async all() {
        return { results: [], meta: { changes: 0 } }
      },
      async run() {
        return { success: true, meta: { changes: 0 } }
      },
    }
    return bound
  }
  const env: HostEnv = {
    DB: { prepare: (sql: string) => d1(sql) } as unknown as D1Database,
    PLANS: {
      idFromName: () => 'id',
      get: () => ({
        fetch: async (request: Request) => {
          const path = new URL(request.url).pathname
          if (path === '/internal/init') {
            return Response.json(initPlan(room, (await request.json()) as never))
          }
          if (path === '/view') {
            if (!planHosted(room)) return new Response('no data', { status: 404 })
            return Response.json(planView(room))
          }
          return new Response('unexpected', { status: 500 })
        },
      }),
    },
    BETTER_AUTH_SECRET: 'local-dev-secret-at-least-32-characters',
  }
  return { env, room }
}

test('an empty plan room is filled from the latest published version', async () => {
  const { env, room } = previewEnv(true)
  assert.equal(await seedPlanRoom(env, PLAN), true)
  assert.equal(planHosted(room), true)
  const view = planView(room) as { title: string; source: string; mode: string }
  assert.equal(view.title, 'Rollout')
  assert.equal(view.source, '# Rollout\n')
  assert.equal(view.mode, 'watch')
})

test('an empty plan room with no published version is left empty', async () => {
  const { env, room } = previewEnv(false)
  assert.equal(await seedPlanRoom(env, PLAN), false)
  assert.equal(planHosted(room), false)
})
