import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Database } from 'bun:sqlite'
import {
  ackEvents,
  agentHello,
  initPlan,
  pendingEvents,
  planView,
  PlanRoomError,
  submitReview,
  updateMode,
  type PlanSql,
} from '../src/host/planRoom.ts'
import { readIteration } from '../src/reviewRound.ts'
import { retryDelay } from '../src/agentStream.ts'

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

function hostedPlan(mode = 'review'): PlanSql {
  const sql = sqlOf(new Database(':memory:'))
  initPlan(sql, { token: 'plan-token', title: 'Demo', mode, tier: 'free', source: '# Demo\n' })
  return sql
}

function deliverAll(sql: PlanSql): void {
  ackEvents(
    sql,
    pendingEvents(sql).map((event) => String(event.id)),
  )
}

function helloData(sql: PlanSql): { mode: string; iteration: number; review: { decision?: string } | null } {
  return agentHello(sql).data as { mode: string; iteration: number; review: { decision?: string } | null }
}

test('a second hosted review round clears a verdict the agent already received', () => {
  const sql = hostedPlan()
  submitReview(sql, { decision: 'iterate' })
  deliverAll(sql)
  const again = initPlan(sql, { token: 'plan-token', title: 'Demo', mode: 'review', tier: 'free', source: '# Demo\n', iteration: 2 })
  const hello = helloData(sql)
  assert.equal(hello.review, null)
  assert.equal(hello.mode, 'review')
  assert.equal(hello.iteration, 2)
  // The open tab hears the new round.
  assert.deepEqual(
    again.outbound.map((item) => item.event),
    ['mode'],
  )
  assert.equal((submitReview(sql, { decision: 'approve' }).body as { review: { iteration: number } }).review.iteration, 2)
})

test('a hosted review started again keeps a verdict no agent has received', () => {
  const sql = hostedPlan()
  submitReview(sql, { decision: 'approve' })
  initPlan(sql, { token: 'plan-token', title: 'Demo', mode: 'review', tier: 'free', source: '# Demo\n', iteration: 2 })
  const hello = helloData(sql)
  assert.equal(hello.review?.decision, 'approve')
  // Approve moved the plan to watch, and the kept verdict leaves it there.
  assert.equal(hello.mode, 'watch')
  assert.equal(hello.iteration, 1)
})

test('mode review is refused while the last verdict is unread, then allowed once it is delivered', () => {
  const sql = hostedPlan()
  submitReview(sql, { decision: 'deny' })
  assert.throws(
    () => updateMode(sql, { mode: 'review', iteration: 2 }),
    (error: unknown) => error instanceof PlanRoomError && error.status === 409 && /live-plan events/.test(error.message),
  )
  assert.equal(planView(sql).mode, 'watch')
  deliverAll(sql)
  const result = updateMode(sql, { mode: 'review', iteration: 2 })
  assert.deepEqual(result.body, { ok: true, mode: 'review', iteration: 2 })
  assert.deepEqual(result.outbound[0], { event: 'mode', data: { mode: 'review', iteration: 2, review: null } })
})

test('comment and watch switch freely while a verdict is unread', () => {
  const sql = hostedPlan()
  submitReview(sql, { decision: 'iterate' })
  updateMode(sql, { mode: 'comment' })
  assert.equal(planView(sql).mode, 'comment')
  updateMode(sql, { mode: 'watch' })
  assert.equal(planView(sql).mode, 'watch')
  assert.equal(helloData(sql).review?.decision, 'iterate')
})

test('a hosted verdict tells listeners the mode it moved to', () => {
  const sql = hostedPlan()
  const approved = submitReview(sql, { decision: 'approve' })
  assert.deepEqual(
    approved.outbound.map((item) => item.event),
    ['notice', 'review', 'mode'],
  )
  assert.equal((approved.outbound[2]?.data as { mode: string }).mode, 'watch')
})

test('mode rejects an iteration that is not a whole number of 1 or more', () => {
  const sql = hostedPlan('watch')
  assert.throws(() => updateMode(sql, { mode: 'review', iteration: 0 }), /whole number/)
  assert.equal(readIteration(undefined), undefined)
  assert.equal(readIteration('3'), 3)
  assert.equal(readIteration(2), 2)
  assert.equal(readIteration(1.5), 'invalid')
  assert.equal(readIteration('two'), 'invalid')
  assert.equal(readIteration(''), 'invalid')
})

test('reconnect waits grow from about a second to at most thirty', () => {
  const middle = () => 0.5
  assert.equal(retryDelay(0, middle), 1_000)
  assert.equal(retryDelay(1, middle), 2_000)
  assert.equal(retryDelay(3, middle), 8_000)
  assert.equal(retryDelay(20, middle), 30_000)
  assert.ok(retryDelay(0, () => 0) >= 800)
  assert.ok(retryDelay(20, () => 1) <= 36_000)
})
