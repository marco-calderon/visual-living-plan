import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inSubmissionOrder, newestFirst, withReviewNote } from '../src/commentOrder.ts'

const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id)

// The device copy hands rows back sorted by their random id, not by when they were sent.
const byRandomId = [
  { id: 'cmt_A9x', createdAt: 300 },
  { id: 'cmt_Kp2', createdAt: 100 },
  { id: 'cmt_q7Z', createdAt: 200 },
]

test('comments come back oldest first whatever order a source hands them in', () => {
  assert.deepEqual(ids(inSubmissionOrder(byRandomId)), ['cmt_Kp2', 'cmt_q7Z', 'cmt_A9x'])
})

test('the popover and the tray list comments newest first', () => {
  assert.deepEqual(ids(newestFirst(byRandomId)), ['cmt_A9x', 'cmt_q7Z', 'cmt_Kp2'])
})

test('comments sent at the same time keep their order, and a comment with no time counts as the oldest', () => {
  const rows = [
    { id: 'first', createdAt: 50 },
    { id: 'untimed' },
    { id: 'second', createdAt: 50 },
    { id: 'broken', createdAt: Number.NaN },
  ]
  assert.deepEqual(ids(inSubmissionOrder(rows)), ['untimed', 'broken', 'first', 'second'])
  assert.deepEqual(ids(newestFirst(rows)), ['second', 'first', 'broken', 'untimed'])
})

test('ordering copies the list and leaves the given one as it was', () => {
  const rows = byRandomId.slice()
  newestFirst(rows)
  inSubmissionOrder(rows)
  assert.deepEqual(rows, byRandomId)
})

test('a review note sits above the newest comment it was sent with', () => {
  const messages = [{ id: 'later' }, { id: 'carried-2' }, { id: 'carried-1' }, { id: 'earlier' }]
  const placed = withReviewNote(messages, { id: 'review-note' }, ['carried-1', 'carried-2'])
  assert.deepEqual(ids(placed), ['later', 'review-note', 'carried-2', 'carried-1', 'earlier'])
})

test('a review note with none of its comments listed goes on top', () => {
  const messages = [{ id: 'one' }, { id: 'two' }]
  assert.deepEqual(ids(withReviewNote(messages, { id: 'review-note' }, [])), ['review-note', 'one', 'two'])
  assert.deepEqual(ids(withReviewNote(messages, { id: 'review-note' }, ['gone'])), ['review-note', 'one', 'two'])
  assert.deepEqual(ids(withReviewNote([], { id: 'review-note' }, ['gone'])), ['review-note'])
})
