import type { PlanDocument, SnapshotRecord } from '../../server/protocol'

export type PlanHostBridge = {
  connected: boolean
  plan: PlanDocument | null
  snapshots: SnapshotRecord[]
  edit: (body: string, title?: string) => Promise<void>
  restore: (snapshotId: string) => Promise<void>
  create: (title: string, body: string) => Promise<void>
  open: (planId: string) => void
}

declare global {
  interface Window {
    __MDX_PLAN_HOST__?: PlanHostBridge
  }
}

export {}
