/** Shared contract for the MDX React spike. The Vite host and the Bun server both import this file. */

export const samplePlanId = 'plan_sample'
export const sampleSnapshotId = 'snap_sample'

export const maxTitleLength = 200
export const maxBodyLength = 500_000

/** App → server. Posted as JSON to `POST /events`, then echoed on the shared stream. */
export const clientEventNames = ['create', 'edit', 'restore'] as const

/** Server → app. One `EventSource` on `GET /events` carries every name. */
export const serverEventNames = ['hello', 'create', 'edit', 'restore', 'plan', 'snapshot'] as const

export type ClientEventName = (typeof clientEventNames)[number]
export type ServerEventName = (typeof serverEventNames)[number]
export type SnapshotReason = 'create' | 'edit' | 'restore'

export type PlanDocument = {
  id: string
  title: string
  body: string
  createdAt: number
  updatedAt: number
  headSnapshotId: string
}

export type SnapshotRecord = {
  id: string
  documentId: string
  seq: number
  parentId: string | null
  title: string
  body: string
  reason: SnapshotReason
  restoredFromId: string | null
  createdAt: number
}

export type HelloEventData = {
  plans: PlanDocument[]
  snapshots: SnapshotRecord[]
}

export type PlanEventData = {
  plan: PlanDocument
}

export type SnapshotEventData = {
  snapshot: SnapshotRecord
}

/** Payload for echoed `create`, `edit`, and `restore` events. */
export type AppliedEventData = {
  plan: PlanDocument
  snapshot: SnapshotRecord
}

export type CreateEventData = {
  title: string
  body: string
}

export type EditEventData = {
  planId: string
  body: string
  title?: string
}

export type RestoreEventData = {
  planId: string
  snapshotId: string
}

export type PostEventsResponse = {
  ok: true
  changed: boolean
  plan: PlanDocument
  snapshot: SnapshotRecord | null
}

export type ApplyResult = {
  changed: boolean
  plan: PlanDocument
  snapshot: SnapshotRecord | null
}

/**
 * Props the host passes into `ui` `PlanRoot` when that module exists.
 * `onEdit` and `onRestore` apply to the open plan. `onCreate` stores a new document and opens it.
 */
export type PlanHostProps = {
  plan: PlanDocument | null
  snapshots: SnapshotRecord[]
  connected: boolean
  onEdit: (body: string, title?: string) => Promise<void>
  onRestore: (snapshotId: string) => Promise<void>
  onCreate: (title: string, body: string) => Promise<void>
}

export function isClientEventName(value: string): value is ClientEventName {
  return (clientEventNames as readonly string[]).includes(value)
}
