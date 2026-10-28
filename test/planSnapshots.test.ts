import assert from 'node:assert/strict'
import test from 'node:test'
import { openPlanSnapshots } from '../src/planSnapshots.ts'

test('plan snapshots append edits and restore a previous body', () => {
  const store = openPlanSnapshots(':memory:', 'plan_test')
  try {
    const created = store.sync('Rate limit', '# One\n')
    assert.equal(created.changed, true)
    assert.equal(created.snapshot?.seq, 1)
    assert.equal(created.snapshot?.reason, 'create')
    const same = store.sync('Rate limit', '# One\n')
    assert.equal(same.changed, false)
    const edited = store.sync('Rate limit', '# Two\n')
    assert.equal(edited.changed, true)
    assert.equal(edited.snapshot?.reason, 'edit')
    assert.equal(edited.snapshot?.seq, 2)
    const restored = store.restore(created.snapshot?.id ?? '')
    assert.equal(restored.changed, true)
    assert.equal(restored.plan.body, '# One\n')
    assert.equal(restored.snapshot?.reason, 'restore')
    assert.equal(restored.snapshot?.restoredFromId, created.snapshot?.id)
    assert.equal(store.list().length, 3)
    assert.equal(store.head()?.body, '# One\n')
  } finally {
    store.close()
  }
})
