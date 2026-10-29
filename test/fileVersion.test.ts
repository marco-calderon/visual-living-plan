import assert from 'node:assert/strict'
import test from 'node:test'
import { fileVersionName, fileVersionSeq, fileVersionText } from '../src/fileVersion.ts'

test('the file version is the head snapshot, otherwise the latest sequence', () => {
  assert.equal(fileVersionSeq([], null), 1)
  assert.equal(
    fileVersionSeq(
      [
        { id: 'snap_a', seq: 1 },
        { id: 'snap_b', seq: 4 },
      ],
      'snap_b',
    ),
    4,
  )
  assert.equal(
    fileVersionSeq(
      [
        { id: 'snap_a', seq: 1 },
        { id: 'snap_b', seq: 4 },
      ],
      'missing',
    ),
    4,
  )
  assert.equal(fileVersionText(4), 'v4')
  assert.equal(fileVersionName(4), 'Version · v4')
})
