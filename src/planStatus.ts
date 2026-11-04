/**
 * The plan's status, shown as a dot on the title bar logo and on the tab icon.
 *
 * - `running`: execution is active.
 * - `approval`: the plan is in review mode and nobody has decided yet.
 * - `stopped`: anything else.
 */
export type PlanStatus = 'approval' | 'running' | 'stopped'

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  approval: 'Waiting for approval',
  running: 'Running',
  stopped: 'Stopped',
}

/** Dot colors. The tab icon is drawn on a canvas, so it cannot read CSS tokens. */
export const PLAN_STATUS_COLOR: Record<PlanStatus, string> = {
  approval: '#f59e0b',
  running: '#04b54b',
  stopped: '#a1a1aa',
}

export function planStatus(input: { mode?: string | null; decision?: string | null; active?: boolean | null }): PlanStatus {
  if (input.active) return 'running'
  if (input.mode === 'review' && !input.decision) return 'approval'
  return 'stopped'
}
