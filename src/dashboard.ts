import type { PlanRecord } from './processRecord'

export type DashboardPeriod = 'day' | 'week' | 'month'

export type DashboardSummary = {
  period: DashboardPeriod
  label: string
  from: number
  to: number
  plans: number
  started: number
  /** Open plans: the session is still hosted. Active plus idle. */
  running: number
  /** Open plans with an agent connected. */
  active: number
  /** Open plans with no agent connected. */
  idle: number
  executed: number
  interrupted: number
  filesModified: number
  durationMs: number
  folders: number
}

export type DashboardPayload = {
  summary: DashboardSummary
  plans: PlanRecord[]
}

/**
 * What a dashboard row shows for a plan:
 *
 * - `active`: the plan is open and an agent is connected to it.
 * - `idle`: the plan is open, and no agent is waiting on it.
 * - `executed` and `interrupted`: the run is over.
 */
export type PlanActivity = 'active' | 'idle' | 'executed' | 'interrupted'

export function planActivity(plan: { status: string; agentConnected?: boolean | null }): PlanActivity {
  if (plan.status === 'executed' || plan.status === 'interrupted') return plan.status
  return plan.agentConnected ? 'active' : 'idle'
}

export function parsePeriod(value: unknown): DashboardPeriod | null {
  if (value === 'day' || value === 'week' || value === 'month') return value
  return null
}

/** Local calendar window ending at `now`. Week starts Monday. */
export function periodRange(period: DashboardPeriod, now: number): { from: number; to: number; label: string } {
  if (period === 'day') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    return { from: start.getTime(), to: now, label: 'Today' }
  }
  if (period === 'week') {
    const start = new Date(now)
    const day = start.getDay()
    const sinceMonday = day === 0 ? 6 : day - 1
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - sinceMonday)
    return { from: start.getTime(), to: now, label: 'This week' }
  }
  const start = new Date(now)
  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  return { from: start.getTime(), to: now, label: 'This month' }
}

function overlaps(plan: PlanRecord, from: number, to: number): boolean {
  if (plan.startedAt > to) return false
  if (plan.status === 'running') return true
  const ended = plan.endedAt ?? plan.heartbeatAt
  return ended >= from
}

export function buildDashboard(records: PlanRecord[], period: DashboardPeriod, now = Date.now()): DashboardPayload {
  const range = periodRange(period, now)
  const inRange = records
    .filter((plan) => overlaps(plan, range.from, range.to))
    .sort((left, right) => right.startedAt - left.startedAt)
  const folders = new Set(inRange.map((plan) => plan.directory).filter((directory) => directory.length > 0))
  return {
    summary: {
      period,
      label: range.label,
      from: range.from,
      to: range.to,
      plans: inRange.length,
      started: inRange.filter((plan) => plan.startedAt >= range.from).length,
      running: inRange.filter((plan) => plan.status === 'running').length,
      active: inRange.filter((plan) => planActivity(plan) === 'active').length,
      idle: inRange.filter((plan) => planActivity(plan) === 'idle').length,
      executed: inRange.filter((plan) => plan.status === 'executed').length,
      interrupted: inRange.filter((plan) => plan.status === 'interrupted').length,
      filesModified: inRange.reduce((sum, plan) => sum + plan.filesModified, 0),
      durationMs: inRange.reduce((sum, plan) => sum + Math.max(0, plan.durationMs), 0),
      folders: folders.size,
    },
    plans: inRange,
  }
}
