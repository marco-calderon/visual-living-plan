import type { PlanDocument, SnapshotRecord } from '../../server/protocol'

export type StreamState = {
  plans: PlanDocument[]
  snapshots: SnapshotRecord[]
}

export const emptyStreamState: StreamState = { plans: [], snapshots: [] }

export function reducePlanStream(state: StreamState, event: string, data: unknown): StreamState {
  if (event === 'hello') return applyHello(state, data)
  if (event === 'plan') return applyPlan(state, data)
  if (event === 'snapshot') return applySnapshot(state, data)
  if (event === 'create' || event === 'edit' || event === 'restore') return applyChange(state, data)
  return state
}

function applyHello(state: StreamState, data: unknown): StreamState {
  if (!isRecord(data) || !Array.isArray(data.plans) || !Array.isArray(data.snapshots)) return state
  return {
    plans: sortPlans(data.plans.filter(isPlan)),
    snapshots: sortSnapshots(data.snapshots.filter(isSnapshot)),
  }
}

function applyPlan(state: StreamState, data: unknown): StreamState {
  if (!isRecord(data) || !isPlan(data.plan)) return state
  return { ...state, plans: upsertPlan(state.plans, data.plan) }
}

function applySnapshot(state: StreamState, data: unknown): StreamState {
  if (!isRecord(data) || !isSnapshot(data.snapshot)) return state
  return { ...state, snapshots: upsertSnapshot(state.snapshots, data.snapshot) }
}

function applyChange(state: StreamState, data: unknown): StreamState {
  if (!isRecord(data)) return state
  const plans = isPlan(data.plan) ? upsertPlan(state.plans, data.plan) : state.plans
  const snapshots = isSnapshot(data.snapshot) ? upsertSnapshot(state.snapshots, data.snapshot) : state.snapshots
  if (plans === state.plans && snapshots === state.snapshots) return state
  return { plans, snapshots }
}

function upsertPlan(plans: PlanDocument[], plan: PlanDocument): PlanDocument[] {
  const next = plans.filter((item) => item.id !== plan.id)
  next.push(plan)
  return sortPlans(next)
}

function upsertSnapshot(snapshots: SnapshotRecord[], snapshot: SnapshotRecord): SnapshotRecord[] {
  const next = snapshots.filter((item) => item.id !== snapshot.id)
  next.push(snapshot)
  return sortSnapshots(next)
}

function sortPlans(plans: PlanDocument[]): PlanDocument[] {
  return plans.sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
}

function sortSnapshots(snapshots: SnapshotRecord[]): SnapshotRecord[] {
  return snapshots.sort(
    (left, right) => left.documentId.localeCompare(right.documentId) || left.seq - right.seq,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPlan(value: unknown): value is PlanDocument {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.body === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number' &&
    typeof value.headSnapshotId === 'string'
  )
}

function isSnapshot(value: unknown): value is SnapshotRecord {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.documentId === 'string' &&
    typeof value.seq === 'number' &&
    (value.parentId === null || typeof value.parentId === 'string') &&
    typeof value.title === 'string' &&
    typeof value.body === 'string' &&
    (value.reason === 'create' || value.reason === 'edit' || value.reason === 'restore') &&
    (value.restoredFromId === null || typeof value.restoredFromId === 'string') &&
    typeof value.createdAt === 'number'
  )
}
