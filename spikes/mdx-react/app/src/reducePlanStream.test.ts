import { describe, expect, test } from 'bun:test'
import type { PlanDocument, SnapshotRecord } from '../../server/protocol'
import { emptyStreamState, reducePlanStream } from './reducePlanStream'

function plan(overrides: Partial<PlanDocument> = {}): PlanDocument {
  return {
    id: 'plan_sample',
    title: 'Sample plan',
    body: '# Sample\n',
    createdAt: 1,
    updatedAt: 1,
    headSnapshotId: 'snap_1',
    ...overrides,
  }
}

function snapshot(overrides: Partial<SnapshotRecord> = {}): SnapshotRecord {
  return {
    id: 'snap_1',
    documentId: 'plan_sample',
    seq: 1,
    parentId: null,
    title: 'Sample plan',
    body: '# Sample\n',
    reason: 'create',
    restoredFromId: null,
    createdAt: 1,
    ...overrides,
  }
}

describe('reducePlanStream', () => {
  test('hello replaces the open store', () => {
    const next = reducePlanStream(emptyStreamState, 'hello', {
      plans: [plan()],
      snapshots: [snapshot()],
    })
    expect(next.plans).toHaveLength(1)
    expect(next.snapshots[0]?.seq).toBe(1)
  })

  test('an edit updates the plan and appends one snapshot', () => {
    const start = reducePlanStream(emptyStreamState, 'hello', {
      plans: [plan()],
      snapshots: [snapshot()],
    })
    const edited = plan({ body: '# Edited\n', updatedAt: 2, headSnapshotId: 'snap_2' })
    const added = snapshot({ id: 'snap_2', seq: 2, parentId: 'snap_1', body: '# Edited\n', reason: 'edit', createdAt: 2 })
    const next = reducePlanStream(start, 'edit', { plan: edited, snapshot: added })
    expect(next.plans).toEqual([edited])
    expect(next.snapshots.map((item) => item.id)).toEqual(['snap_1', 'snap_2'])
    const again = reducePlanStream(reducePlanStream(next, 'snapshot', { snapshot: added }), 'plan', { plan: edited })
    expect(again).toEqual(next)
  })

  test('restore keeps older snapshots and moves the head', () => {
    const start = {
      plans: [plan({ body: '# Two\n', headSnapshotId: 'snap_2', updatedAt: 2 })],
      snapshots: [
        snapshot(),
        snapshot({ id: 'snap_2', seq: 2, parentId: 'snap_1', body: '# Two\n', reason: 'edit', createdAt: 2 }),
      ],
    }
    const restored = plan({ body: '# Sample\n', headSnapshotId: 'snap_3', updatedAt: 3 })
    const added = snapshot({
      id: 'snap_3',
      seq: 3,
      parentId: 'snap_2',
      body: '# Sample\n',
      reason: 'restore',
      restoredFromId: 'snap_1',
      createdAt: 3,
    })
    const next = reducePlanStream(start, 'restore', { plan: restored, snapshot: added })
    expect(next.plans[0]?.body).toBe('# Sample\n')
    expect(next.snapshots).toHaveLength(3)
    expect(next.snapshots[2]?.restoredFromId).toBe('snap_1')
  })

  test('ignores unknown events and malformed payloads', () => {
    const start = reducePlanStream(emptyStreamState, 'hello', { plans: [plan()], snapshots: [snapshot()] })
    expect(reducePlanStream(start, 'comment', { plan: plan({ body: 'nope' }) })).toBe(start)
    expect(reducePlanStream(start, 'plan', { plan: { id: 'plan_sample' } })).toBe(start)
  })
})
