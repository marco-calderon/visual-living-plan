import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clearDraft, isLegacyDraft, readDraft, throttle, writeDraft } from '../client/editor/draftStore.ts'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test('the draft saver writes at most once per window and always writes the last change', async () => {
  let saves = 0
  const saver = throttle(() => {
    saves += 1
  }, 40)
  for (let i = 0; i < 10; i++) saver.call()
  assert.equal(saves, 0)
  await sleep(60)
  assert.equal(saves, 1)
  saver.call()
  saver.flush()
  assert.equal(saves, 2)
  // Nothing pending: flush does not write again.
  saver.flush()
  assert.equal(saves, 2)
  saver.call()
  saver.cancel()
  await sleep(60)
  assert.equal(saves, 2)
})

test('a draft is kept per plan until it is cleared, and a refused write is reported', () => {
  const items = new Map<string, string>()
  const previous = (globalThis as { window?: unknown }).window
  ;(globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (value.includes('too big')) throw new Error('QuotaExceededError')
        items.set(key, value)
      },
      removeItem: (key: string) => items.delete(key),
    },
  }
  try {
    assert.equal(readDraft('a'), null)
    assert.equal(writeDraft('a', { base: '# A\n', source: '# A!\n', edits: 2, savedAt: 1 }), true)
    assert.deepEqual(readDraft('a'), { base: '# A\n', source: '# A!\n', edits: 2, savedAt: 1 })
    assert.equal(readDraft('b'), null)
    assert.equal(writeDraft('b', { base: '', source: 'too big', edits: 1, savedAt: 2 }), false)
    // A draft from the whole-page editor is still read, so the page can turn it into a plan file.
    items.set('living-plan:draft:old', JSON.stringify({ base: '# A\n', markdown: '# A?\n', savedAt: 3 }))
    const old = readDraft('old')
    assert.deepEqual(old, { base: '# A\n', markdown: '# A?\n', savedAt: 3 })
    assert.equal(old !== null && isLegacyDraft(old), true)
    clearDraft('a')
    assert.equal(readDraft('a'), null)
  } finally {
    ;(globalThis as { window?: unknown }).window = previous
  }
})
