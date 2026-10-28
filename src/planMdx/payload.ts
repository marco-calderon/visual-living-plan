import type { PhaseStatus } from '../types'

const PHASE_STATUSES: PhaseStatus[] = ['pending', 'active', 'blocked', 'done', 'failed']

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

export function phaseStatus(value: unknown): PhaseStatus {
  const status = String(value ?? 'pending')
  return PHASE_STATUSES.includes(status as PhaseStatus) ? (status as PhaseStatus) : 'pending'
}

export function calloutKind(value: unknown): 'note' | 'tip' | 'risk' | 'decision' | 'warning' {
  const kind = String(value ?? 'note')
  if (kind === 'tip' || kind === 'risk' || kind === 'decision' || kind === 'warning') return kind
  return 'note'
}
