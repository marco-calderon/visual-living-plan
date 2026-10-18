import type { PlanRecord } from './processRecord'

export type DashboardPeriod = 'day' | 'week' | 'month'

export type DashboardSummary = {
  period: DashboardPeriod
  label: string
  from: number
  to: number
  plans: number
  started: number
  running: number
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
  const active = records
    .filter((plan) => overlaps(plan, range.from, range.to))
    .sort((left, right) => right.startedAt - left.startedAt)
  const folders = new Set(active.map((plan) => plan.directory).filter((directory) => directory.length > 0))
  return {
    summary: {
      period,
      label: range.label,
      from: range.from,
      to: range.to,
      plans: active.length,
      started: active.filter((plan) => plan.startedAt >= range.from).length,
      running: active.filter((plan) => plan.status === 'running').length,
      executed: active.filter((plan) => plan.status === 'executed').length,
      interrupted: active.filter((plan) => plan.status === 'interrupted').length,
      filesModified: active.reduce((sum, plan) => sum + plan.filesModified, 0),
      durationMs: active.reduce((sum, plan) => sum + Math.max(0, plan.durationMs), 0),
      folders: folders.size,
    },
    plans: active,
  }
}
