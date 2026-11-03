import assert from 'node:assert/strict'
import test from 'node:test'
import { versionMenuEntries } from '../src/planVersionMenu.ts'

test('the version menu lists the live plan before older published versions', () => {
  const entries = versionMenuEntries('plan1234', [
    { seq: 2, createdAt: 20 },
    { seq: 0, createdAt: 5 },
    { seq: 4, createdAt: 40 },
    { seq: 4, createdAt: 30 },
    { seq: 3, createdAt: 25 },
  ])
  assert.deepEqual(
    entries.map((entry) => entry.label),
    ['Live', 'Version 4', 'Version 3', 'Version 2'],
  )
  assert.equal(entries[0]?.href, '/plans/plan1234')
  assert.equal(entries[1]?.href, '/plans/plan1234/versions/4')
  assert.equal(entries[1]?.kind, 'version')
})
