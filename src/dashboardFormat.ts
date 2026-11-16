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

/** Completion of the plan's work. `idle` reads "Not started" so it is not confused with an Idle row. */
const COMPLETION_LABEL: Record<CompletionState, string> = {
  idle: 'Not started',
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
  return COMPLETION_LABEL.idle
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
  return rangeText(summary.from, summary.to)
}

/**
 * A period's window, with the day written once when it starts and ends on the same day:
 * "Nov 15, 12:00 AM – 9:24 PM", or "Nov 10 – Nov 15, 9:24 PM" across days.
 * Self-contained: the local dashboard script inlines it with `toString()`.
 */
export function rangeText(from: number | null | undefined, to: number | null | undefined): string {
  if (!from && !to) return ''
  const day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
  const start = new Date(Number(from) || Number(to))
  const end = new Date(Number(to) || Number(from))
  if (start.toDateString() === end.toDateString()) return `${day.format(start)}, ${time.format(start)} – ${time.format(end)}`
  return `${day.format(start)} – ${day.format(end)}, ${time.format(end)}`
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

/**
 * The status line beside the period tabs once plans have loaded: the period and its window,
 * such as "Today · Nov 15, 12:00 AM – 9:24 PM". Loading, errors, and offline replace it.
 */
export function dashboardStatusLine(summary: Pick<DashboardSummary, 'label' | 'from' | 'to'>): string {
  const range = summary.from ? rangeText(summary.from, summary.to) : ''
  const label = summary.label || 'Period'
  return range ? `${label} · ${range}` : label
}

/** The count beside the table caption: "5", or "2 of 5" while a status filter hides some. */
export function plansCountText(shown: number, total: number, filter: DashboardFilter): string {
  return filter === 'all' ? String(total) : `${shown} of ${total}`
}

/**
 * The line under the plan count: how many of the period's plans started inside it.
 * Self-contained: the local dashboard script inlines it with `toString()`.
 */
export function startedText(summary: { plans?: number; started?: number; period?: string }): string {
  const when = summary.period === 'week' ? 'this week' : summary.period === 'month' ? 'this month' : 'today'
  if (!summary.plans) return `No plans ${when}`
  return `${Number(summary.started) || 0} started ${when}`
}

export type StatusSegment = { id: PlanActivity; label: string; count: number; share: number }

/**
 * The status bar's parts in drawing order, open plans first, then finished runs. `share` is the
 * whole-number percent of the period's plans. Self-contained: the local dashboard script inlines it.
 */
export function statusSegments(summary: {
  active?: number
  idle?: number
  running?: number
  executed?: number
  interrupted?: number
}): StatusSegment[] {
  const active = Number(summary.active) || 0
  const idle = summary.idle == null ? Math.max(0, (Number(summary.running) || 0) - active) : Number(summary.idle) || 0
  const parts: Array<[PlanActivity, string, number]> = [
    ['active', 'Active', active],
    ['idle', 'Idle', idle],
    ['executed', 'Executed', Number(summary.executed) || 0],
    ['interrupted', 'Interrupted', Number(summary.interrupted) || 0],
  ]
  const total = parts.reduce((sum, part) => sum + part[2], 0)
  return parts.map(([id, label, count]) => ({ id, label, count, share: total ? Math.round((count / total) * 100) : 0 }))
}

/** The review verdict a finished row reads. Empty when there was none. Self-contained. */
export function outcomeLabel(outcome: string | null | undefined): string {
  if (outcome === 'approve') return 'Approved'
  if (outcome === 'deny') return 'Denied'
  if (outcome === 'iterate') return 'Iterate requested'
  return ''
}

/**
 * Where a plan lives: the name of its folder, and the plan file relative to that folder (the whole
 * path when the file is elsewhere). A hosted plan has no file, so both are empty. Self-contained.
 */
export function planPlace(plan: { directory?: string | null; planPath?: string | null }): { folder: string; file: string } {
  const path = String(plan.planPath || '')
  if (!path) return { folder: '', file: '' }
  const directory = String(plan.directory || '').replace(/[\\/]+$/, '')
  const folder = directory.slice(Math.max(directory.lastIndexOf('/'), directory.lastIndexOf('\\')) + 1)
  const inside = directory && (path.startsWith(directory + '/') || path.startsWith(directory + '\\'))
  return { folder, file: inside ? path.slice(directory.length + 1) : path }
}

/** "1/3 phases · 3/4 answers", leaving out a part the plan does not have. Self-contained. */
export function progressDetail(plan: {
  phaseDone?: number
  phaseTotal?: number
  interactionDone?: number
  interactionTotal?: number
}): string {
  const parts: string[] = []
  const phases = Number(plan.phaseTotal) || 0
  const asked = Number(plan.interactionTotal) || 0
  if (phases > 0) parts.push(`${Number(plan.phaseDone) || 0}/${phases} phases`)
  if (asked > 0) parts.push(`${Number(plan.interactionDone) || 0}/${asked} answers`)
  return parts.length ? parts.join(' · ') : 'No phases or questions'
}

/** "1 question waiting", "3 questions waiting". Self-contained. */
export function questionsText(count: number): string {
  return count === 1 ? '1 question waiting' : `${count} questions waiting`
}

/** How long a plan has been open, or how long its run took. `duration` is already formatted. Self-contained. */
export function durationPhrase(status: string, duration: string): string {
  if (status === 'running') return `Open for ${duration}`
  if (status === 'interrupted') return `Stopped after ${duration}`
  return `Ran for ${duration}`
}

/** "1 file changed", "6 files changed". Self-contained. */
export function filesText(count: number): string {
  return count === 1 ? '1 file changed' : `${count} files changed`
}
