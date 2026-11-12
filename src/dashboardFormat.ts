import { planActivity, type DashboardPeriod, type DashboardSummary, type PlanActivity } from './dashboard'
import { agentPresenceText } from './agentPresence'
import type { CompletionState } from './processRecord'

export type DashboardFilter = 'all' | PlanActivity

export const DASHBOARD_FILTERS: Array<{ id: DashboardFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'idle', label: 'Idle' },
  { id: 'executed', label: 'Executed' },
  { id: 'interrupted', label: 'Interrupted' },
]

const ACTIVITY_LABEL: Record<PlanActivity, string> = {
  active: 'Active',
  idle: 'Idle',
  executed: 'Executed',
  interrupted: 'Interrupted',
}

const COMPLETION_LABEL: Record<CompletionState, string> = {
  idle: 'Idle',
  in_progress: 'In progress',
  partial: 'Partial',
  complete: 'Complete',
}

export function activityLabel(activity: PlanActivity): string {
  return ACTIVITY_LABEL[activity]
}

/** The row's pill: Active while an agent is connected, Idle while the plan is open without one. */
export function statusLabel(plan: { status: string; agentConnected?: boolean | null }): string {
  return ACTIVITY_LABEL[planActivity(plan)]
}

/** The line under an open plan's pill. Empty for a finished run. */
export function agentLine(plan: { status: string; agentConnected?: boolean | null; agentSeenAt?: number | null }, now = Date.now()): string {
  if (plan.status !== 'running') return ''
  return agentPresenceText({ connected: Boolean(plan.agentConnected), seenAt: plan.agentSeenAt ?? null }, now)
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

export function visiblePlans<T extends { status: string; agentConnected?: boolean | null }>(plans: T[], filter: DashboardFilter): T[] {
  if (filter === 'all') return plans
  return plans.filter((plan) => planActivity(plan) === filter)
}

/**
 * The empty table line for one period and status filter, such as "No idle plans this week."
 * Self-contained: the local dashboard script inlines it with `toString()`.
 */
export function emptyPlansText(filter: string, period: string): string {
  const when = period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'today'
  const kind =
    filter === 'active' || filter === 'idle' || filter === 'executed' || filter === 'interrupted' ? `${filter} ` : ''
  return `No ${kind}plans ${when}.`
}

export function dashboardStatusLine(
  summary: Pick<DashboardSummary, 'label' | 'from' | 'to' | 'plans' | 'started'> & Partial<Pick<DashboardSummary, 'active'>>,
  shown: number,
  filter: DashboardFilter,
): string {
  const range = summary.from ? formatRange(summary) : ''
  const count = summary.plans
  let text = summary.label || 'Period'
  if (range) text += `. ${range}`
  text += `. ${count} ${count === 1 ? 'plan' : 'plans'}`
  text += `. ${summary.active ?? 0} with an agent connected`
  text += `. ${summary.started} started in this period`
  if (filter !== 'all') text += `. showing ${shown}`
  return text
}
