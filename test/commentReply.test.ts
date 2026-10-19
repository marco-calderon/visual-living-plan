import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newReplyIds, replyArrival, replySurface } from '../src/commentReply.ts'
import type { PlanComment } from '../src/types.ts'

function comment(overrides: Partial<PlanComment> & Pick<PlanComment, 'id' | 'partId' | 'kind' | 'text'>): PlanComment {
  return {
    excerpt: '',
    createdAt: 1,
    addressedAt: null,
    ...overrides,
  }
}

test('a reply lands on the minibar for tray messages and on the part for every other comment', () => {
  assert.equal(replySurface({ kind: 'message', partId: 'review:message' }), 'minibar')
  assert.equal(replySurface({ partId: 'review:message' }), 'minibar')
  assert.equal(replySurface({ kind: 'message', partId: 'phase:implement/paragraph:1' }), 'minibar')
  assert.equal(replySurface({ kind: 'paragraph', partId: 'phase:implement/paragraph:1' }), 'component')
  assert.equal(replySurface({ kind: 'line', partId: 'phase:implement/line:4' }), 'component')
})

test('replyArrival reports only reply ids that were not already on the comment', () => {
  const stored = comment({
    id: 'cmt_part',
    partId: 'phase:implement/paragraph:1',
    kind: 'paragraph',
    text: 'Default the flag on.',
    replies: [{ id: 'rpl_old', text: 'Earlier', createdAt: 2 }],
  })
  const withNew = {
    ...stored,
    replies: [
      { id: 'rpl_old', text: 'Earlier', createdAt: 2 },
      { id: 'rpl_new', text: 'The flag stays on.', createdAt: 3 },
    ],
  }
  assert.deepEqual(newReplyIds([stored], withNew), ['rpl_new'])
  assert.equal(replyArrival([stored], stored), null)
  assert.deepEqual(replyArrival([stored], withNew), { replyIds: ['rpl_new'], surface: 'component' })

  const tray = comment({
    id: 'cmt_tray',
    partId: 'review:message',
    kind: 'message',
    text: 'Leave the bar up.',
    replies: [{ id: 'rpl_tray', text: 'It stays up.', createdAt: 4 }],
  })
  assert.deepEqual(replyArrival([], tray), { replyIds: ['rpl_tray'], surface: 'minibar' })
})
