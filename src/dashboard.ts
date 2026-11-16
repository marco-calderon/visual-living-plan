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
  /** Questions open plans still wait on the person to answer. */
  questions: number
  /** Open plans with at least one question waiting. */
  waiting: number
  /** Phases done and planned, summed over the period's plans. */
  phaseDone: number
  phaseTotal: number
  /** Questions answered and asked, summed over the period's plans. */
  interactionDone: number
  interactionTotal: number
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

/**
 * Questions an open plan still waits on the person to answer: choices, forms, questions, and
 * approvals without a response. A finished run waits on nobody. The local service counts them as
 * `pendingCount`; the hosted host keeps only the answer counts, so both are read.
 * Self-contained: the local dashboard script inlines it with `toString()`.
 */
export function openQuestions(plan: {
  status: string
  pendingCount?: number | null
  interactionTotal?: number | null
  interactionDone?: number | null
}): number {
  if (plan.status !== 'running') return 0
  const pending = Number(plan.pendingCount) || 0
  const unanswered = (Number(plan.interactionTotal) || 0) - (Number(plan.interactionDone) || 0)
  return Math.max(0, pending, unanswered)
}

function sum(plans: PlanRecord[], read: (plan: PlanRecord) => number): number {
  return plans.reduce((total, plan) => total + Math.max(0, Number(read(plan)) || 0), 0)
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
      filesModified: sum(inRange, (plan) => plan.filesModified),
      durationMs: sum(inRange, (plan) => plan.durationMs),
      folders: folders.size,
      questions: sum(inRange, openQuestions),
      waiting: inRange.filter((plan) => openQuestions(plan) > 0).length,
      phaseDone: sum(inRange, (plan) => plan.phaseDone),
      phaseTotal: sum(inRange, (plan) => plan.phaseTotal),
      interactionDone: sum(inRange, (plan) => plan.interactionDone),
      interactionTotal: sum(inRange, (plan) => plan.interactionTotal),
    },
    plans: inRange,
  }
}
