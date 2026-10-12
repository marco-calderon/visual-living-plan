import type { DashboardPayload, DashboardPeriod, DashboardSummary } from '../dashboard.js'
import type { CompletionState, PlanRecord, PlanStatus } from '../processRecord.js'

/** Status chips on the dashboard. `all` keeps every plan in the period. */
export const STATUS_FILTERS = ['all', 'running', 'executed', 'interrupted'] as const

export type DashboardStatusFilter = (typeof STATUS_FILTERS)[number]

export const PERIODS: readonly DashboardPeriod[] = ['day', 'week', 'month']

export const PERIOD_LABEL: Record<DashboardPeriod, string> = {
  day: 'Today',
  week: 'This week',
  month: 'This month',
}

export const FILTER_LABEL: Record<DashboardStatusFilter, string> = {
  all: 'All',
  running: 'Running',
  executed: 'Executed',
  interrupted: 'Interrupted',
}

export const STATUS_LABEL: Record<PlanStatus, string> = {
  running: 'Running',
  executed: 'Executed',
  interrupted: 'Interrupted',
}

export const COMPLETION_LABEL: Record<CompletionState, string> = {
  idle: 'Idle',
  in_progress: 'In progress',
  partial: 'Partial',
  complete: 'Complete',
}

/** Running plans come first. A live execution step comes before an idle running plan. */
export function orderPlans(plans: readonly PlanRecord[]): PlanRecord[] {
  return [...plans].sort((left, right) => {
    const byActivity = activityRank(left) - activityRank(right)
    if (byActivity !== 0) return byActivity
    if (right.startedAt !== left.startedAt) return right.startedAt - left.startedAt
    if (left.id < right.id) return -1
    if (left.id > right.id) return 1
    return 0
  })
}

function activityRank(plan: PlanRecord): number {
  if (plan.status === 'running' && plan.executionActive) return 0
  if (plan.status === 'running') return 1
  return 2
}

export function filterPlans(plans: readonly PlanRecord[], filter: DashboardStatusFilter): PlanRecord[] {
  if (filter === 'all') return [...plans]
  return plans.filter((plan) => plan.status === filter)
}

/** Same client-side status filter as the dashboard page, then active plans first. */
export function presentPlans(plans: readonly PlanRecord[], filter: DashboardStatusFilter): PlanRecord[] {
  return orderPlans(filterPlans(plans, filter))
}

export function shiftPeriod(period: DashboardPeriod, delta: number): DashboardPeriod {
  const index = PERIODS.indexOf(period)
  const next = (index + delta + PERIODS.length) % PERIODS.length
  return PERIODS[next] ?? 'day'
}

export function shiftFilter(filter: DashboardStatusFilter): DashboardStatusFilter {
  const index = STATUS_FILTERS.indexOf(filter)
  return STATUS_FILTERS[(index + 1) % STATUS_FILTERS.length] ?? 'all'
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(Number(ms) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

export function formatWhen(ms: number): string {
  if (!ms) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms))
}

export function formatRange(summary: Pick<DashboardSummary, 'from' | 'to'>): string {
  const start = formatWhen(summary.from)
  const end = formatWhen(summary.to)
  if (!start && !end) return ''
  return `${start} – ${end}`
}

/** Status sentence from the dashboard page, including the client-side filter count. */
export function dashboardStatusLine(
  summary: DashboardSummary,
  filter: DashboardStatusFilter,
  shownCount: number,
): string {
  const range = summary.from ? formatRange(summary) : ''
  const started = typeof summary.started === 'number' ? summary.started : 0
  const plans = summary.plans
  const noun = plans === 1 ? 'plan active' : 'plans active'
  const filtered = filter === 'all' ? '' : ` · showing ${shownCount}`
  return `${summary.label || 'Period'}${range ? ` · ${range}` : ''} · ${plans} ${noun} · ${started} started in this period${filtered}`
}

export function planSubtitle(plan: PlanRecord): string {
  const bits: string[] = [plan.mode || 'watch']
  if (plan.executionStep) bits.push(plan.executionStep)
  if (plan.outcome) bits.push(plan.outcome)
  return bits.join(' · ')
}

export function gitLine(plan: PlanRecord): string {
  const branch = plan.git?.branch
  if (!branch) return ''
  return `${branch}${plan.git.dirty ? ' · dirty' : ' · clean'}`
}

export function completionDetail(plan: PlanRecord): { ratio: number; label: string; counts: string } {
  const ratio = Math.max(0, Math.min(100, Number(plan.completionRatio) || 0))
  const state = COMPLETION_LABEL[plan.completionState] ?? 'Idle'
  return {
    ratio,
    label: `${ratio}% · ${state}`,
    counts: `${Number(plan.phaseDone)}/${Number(plan.phaseTotal)} phases · ${Number(plan.interactionDone)}/${Number(plan.interactionTotal)} answers`,
  }
}

export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

/** Live site link. The dashboard only offers Open while the plan is running. */
export function livePlanUrl(plan: PlanRecord): string | null {
  if (plan.status !== 'running') return null
  return safeHttpUrl(plan.url)
}

/** Archived plan file. Same `/archive/<id>` read the dashboard table links to. */
export function archiveUrl(registryUrl: string, plan: PlanRecord): string | null {
  if (!plan.storedPath || !plan.id) return null
  return new URL(`/archive/${encodeURIComponent(plan.id)}`, registryUrl).href
}

export function summaryStats(summary: DashboardSummary): Array<{ label: string; value: string }> {
  return [
    { label: 'Running', value: String(summary.running) },
    { label: 'Executed', value: String(summary.executed) },
    { label: 'Interrupted', value: String(summary.interrupted) },
    { label: 'Files modified', value: String(summary.filesModified) },
    { label: 'Execution time', value: formatDuration(summary.durationMs) },
    { label: 'Folders', value: String(summary.folders) },
  ]
}

export function isDashboardPayload(value: unknown): value is DashboardPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Partial<DashboardPayload>
  return Boolean(payload.summary) && Array.isArray(payload.plans)
}
