import { mergePlannedExecution, type ExecutionState } from './execution'

/**
 * The plan's status, shown on the title bar chip, as a dot on the logo, and on the tab icon.
 * Checked in this order:
 *
 * - `executing`: a run is active.
 * - `review`: the plan waits for a verdict, or the agent is revising it after Iterate.
 * - `stopped`: the plan was denied, or a workflow step failed.
 * - `completed`: every workflow step is done.
 * - `paused`: the plan was approved or work has started, and no run is active.
 * - `review` again: nothing has started yet, so the plan is still being shaped.
 */
export type PlanStatus = 'review' | 'executing' | 'paused' | 'stopped' | 'completed'

/** How far the workflow has come, read from the step statuses the Workflow tab shows. */
export type WorkState = 'idle' | 'started' | 'failed' | 'completed'

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  review: 'Review',
  executing: 'Executing',
  paused: 'Paused',
  stopped: 'Stopped',
  completed: 'Completed',
}

/** Dot colors. The tab icon is drawn on a canvas, so it cannot read CSS tokens. Keep in step with src/planPage.css. */
export const PLAN_STATUS_COLOR: Record<PlanStatus, string> = {
  review: '#f59e0b',
  executing: '#04b54b',
  paused: '#a1a1aa',
  stopped: '#ef4d3e',
  completed: '#7c3aed',
}

/** The plan's workflow with the live run on top, the same merge the Workflow tab draws. */
export function workState(execution: Pick<ExecutionState, 'planned' | 'graph'> | null | undefined): WorkState {
  const nodes = mergePlannedExecution(execution?.planned, execution?.graph)?.nodes ?? []
  if (nodes.length === 0) return 'idle'
  const statuses = nodes.map((node) => node.status ?? 'pending')
  if (statuses.includes('failed')) return 'failed'
  if (statuses.every((status) => status === 'done')) return 'completed'
  if (statuses.some((status) => status !== 'pending')) return 'started'
  return 'idle'
}

export function planStatus(input: {
  mode?: string | null
  decision?: string | null
  active?: boolean | null
  work?: WorkState | null
}): PlanStatus {
  if (input.active) return 'executing'
  const decision = input.decision || ''
  if (input.mode === 'review' && decision !== 'approve' && decision !== 'deny') return 'review'
  if (decision === 'deny') return 'stopped'
  if (input.work === 'failed') return 'stopped'
  if (input.work === 'completed') return 'completed'
  if (input.work === 'started' || decision === 'approve') return 'paused'
  return 'review'
}
