import type { DashboardPeriod, DashboardSummary } from './dashboard'
import type { CompletionState, PlanStatus } from './processRecord'

export type DashboardFilter = 'all' | PlanStatus

const STATUS_LABEL: Record<PlanStatus, string> = {
  running: 'Running',
  executed: 'Executed',
  interrupted: 'Interrupted',
}

const COMPLETION_LABEL: Record<CompletionState, string> = {
  idle: 'Idle',
  in_progress: 'In progress',
  partial: 'Partial',
  complete: 'Complete',
}

export function statusLabel(status: string): string {
  if (status === 'running' || status === 'executed' || status === 'interrupted') return STATUS_LABEL[status]
  return status || 'Running'
}

export function completionLabel(state: string): string {
  if (state === 'idle' || state === 'in_progress' || state === 'partial' || state === 'complete') {
    return COMPLETION_LABEL[state]
  }
  return 'Idle'
}

export function formatWhen(ms: number | null | undefined): string {
  if (!ms) return ''
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms))
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

export function formatRange(summary: Pick<DashboardSummary, 'from' | 'to'>): string {
  const start = formatWhen(summary.from)
  const end = formatWhen(summary.to)
  if (!start && !end) return ''
  return `${start} – ${end}`
}

/** http(s) links only. Anything else is not offered as Open. */
export function safeHttpUrl(value: string | null | undefined): string {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.href
  } catch {
    return ''
  }
}

export function periodIndex(period: DashboardPeriod): number {
  if (period === 'week') return 1
  if (period === 'month') return 2
  return 0
}

export function visiblePlans<T extends { status: string }>(plans: T[], filter: DashboardFilter): T[] {
  if (filter === 'all') return plans
  return plans.filter((plan) => plan.status === filter)
}

export function dashboardStatusLine(
  summary: Pick<DashboardSummary, 'label' | 'from' | 'to' | 'plans' | 'started'>,
  shown: number,
  filter: DashboardFilter,
): string {
  const range = summary.from ? formatRange(summary) : ''
  const count = summary.plans
  let text = summary.label || 'Period'
  if (range) text += `. ${range}`
  text += `. ${count} ${count === 1 ? 'plan active' : 'plans active'}`
  text += `. ${summary.started} started in this period`
  if (filter !== 'all') text += `. showing ${shown}`
  return text
}
