import assert from 'node:assert/strict'
import { test } from 'node:test'
import { optimisticWrite, refusedForGood } from '../client/offline/browserStore.ts'
import type { CommentRow, PlanRow } from '../src/offlineSync.ts'

/** Just enough of a TanStack collection for the device copy of a write. */
function fakeCollection<T extends { id: string }>(rows: T[]) {
  const store = new Map(rows.map((row) => [row.id, structuredClone(row)]))
  return {
    store,
    get: (id: string) => store.get(id),
    insert: (row: T) => {
      store.set(row.id, row)
    },
    update: (ids: string[], change: (drafts: T[]) => void) => {
      const drafts = ids.flatMap((id) => {
        const row = store.get(id)
        return row ? [row] : []
      })
      change(drafts)
    },
  }
}

function planRow(overrides: Partial<PlanRow> = {}): PlanRow {
  return {
    id: 'plan-1234',
    revision: 3,
    source: '# Plan\n',
    title: 'Plan',
    mode: 'review',
    responses: {},
    review: null,
    locked: false,
    host: 'cloud',
    basePath: '/plans/plan-1234',
    openedAt: 0,
    sourceOmitted: false,
    ...overrides,
  }
}

function commentRow(id: string): CommentRow {
  return { id, planId: 'plan-1234', partId: 'markdown:1', pending: false, comment: { id, text: 'Rename it', addressedAt: null, addressingAt: 5 } }
}

// A TanStack transaction with no device change settles without sending, so every write needs one or a direct send.
test('approve on a stored plan changes the device copy, so the outbox sends it', () => {
  const plans = fakeCollection([planRow()])
  const comments = fakeCollection<CommentRow>([])
  const write = optimisticWrite(plans as never, comments as never, 'plan-1234', 'review', { decision: 'approve' }, 'key-1')
  assert.ok(write, 'a review must change the stored plan')
  write()
  assert.deepEqual(plans.get('plan-1234')?.review, { decision: 'approve' })
  assert.equal(plans.get('plan-1234')?.mode, 'watch')
})

test('iterate keeps the plan in review and keeps the note', () => {
  const plans = fakeCollection([planRow()])
  const write = optimisticWrite(plans as never, fakeCollection<CommentRow>([]) as never, 'plan-1234', 'review', { decision: 'iterate', note: 'Shorter' }, 'key-1')
  write?.()
  assert.deepEqual(plans.get('plan-1234')?.review, { decision: 'iterate', note: 'Shorter' })
  assert.equal(plans.get('plan-1234')?.mode, 'review')
})

test('a write with nothing stored to change is sent straight away', () => {
  const plans = fakeCollection<PlanRow>([])
  const comments = fakeCollection<CommentRow>([])
  assert.equal(optimisticWrite(plans as never, comments as never, 'plan-1234', 'review', { decision: 'approve' }, 'key-1'), null)
  assert.equal(optimisticWrite(plans as never, comments as never, 'plan-1234', 'mode', { mode: 'comment' }, 'key-1'), null)
  assert.equal(optimisticWrite(plans as never, comments as never, 'plan-1234', 'interaction', { id: 'pick' }, 'key-1'), null)
  assert.equal(
    optimisticWrite(plans as never, comments as never, 'plan-1234', 'address', {}, 'key-1', '/plans/plan-1234/api/comments/cmt_9/address'),
    null,
  )
  assert.equal(optimisticWrite(fakeCollection([planRow()]) as never, comments as never, 'plan-1234', 'review', { decision: 'maybe' }, 'key-1'), null)
})

test('addressing a stored comment marks it addressed on the device', () => {
  const comments = fakeCollection([commentRow('cmt_9'), commentRow('cmt_10')])
  const write = optimisticWrite(
    fakeCollection([planRow()]) as never,
    comments as never,
    'plan-1234',
    'address',
    {},
    'key-1',
    '/plans/plan-1234/api/comments/cmt_9/address',
  )
  assert.ok(write)
  write()
  assert.equal(typeof comments.get('cmt_9')?.comment.addressedAt, 'number')
  assert.equal(comments.get('cmt_9')?.comment.addressingAt, null)
  assert.equal(comments.get('cmt_10')?.comment.addressedAt, null)
})

test('a comment still gets a pending placeholder without a stored plan', () => {
  const comments = fakeCollection<CommentRow>([])
  const write = optimisticWrite(fakeCollection<PlanRow>([]) as never, comments as never, 'plan-1234', 'comment', { partId: 'markdown:1', text: 'Hi' }, 'key-1')
  write?.()
  assert.equal(comments.get('pending:key-1')?.pending, true)
})

test('a refusal the host will repeat is not sent again', () => {
  for (const status of [400, 403, 404, 413, 422]) assert.equal(refusedForGood(status), true, String(status))
  for (const status of [200, 408, 429, 500, 502, 503]) assert.equal(refusedForGood(status), false, String(status))
})
