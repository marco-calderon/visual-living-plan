import { buildDashboard, type DashboardPayload, type DashboardPeriod } from '../../src/dashboard'
import { emptyGitSnapshot, isPlanMode, readProgress, type PlanRecord, type ProgressFields } from '../../src/processRecord'
import { AGENT_LEASE_MS } from '../../src/agentPresence'

export type HostedPlanRow = {
  id: string
  title: string | null
  mode: string
  ended_at: number | null
  started_at: number
  version_seq: number | null
  version_title: string | null
  version_at: number | null
  /** `plans.meta` JSON. Progress is saved there after each write to the plan. */
  meta?: string | null
}

const PROGRESS_KEYS = ['phaseTotal', 'phaseDone', 'interactionTotal', 'interactionDone', 'completionRatio', 'completionState'] as const

export const NO_PROGRESS: ProgressFields = {
  phaseTotal: 0,
  phaseDone: 0,
  interactionTotal: 0,
  interactionDone: 0,
  completionRatio: 0,
  completionState: 'idle',
}

/** Progress saved on a plan row, or null when none was saved yet. */
export function hostedProgress(meta: string | null | undefined): ProgressFields | null {
  if (!meta) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(meta)
  } catch {
    return null
  }
  const progress = readProgress(parsed)
  if (!progress.completionState) return null
  return { ...NO_PROGRESS, ...progress }
}

/** Save progress into `plans.meta` beside the other keys, the same fields the local store keeps. */
export async function saveHostedProgress(db: D1Database, planId: string, progress: ProgressFields): Promise<void> {
  const paths = PROGRESS_KEYS.map((key) => `'$.${key}', ?`).join(', ')
  await db
    .prepare(`UPDATE plans SET meta = json_set(COALESCE(meta, '{}'), ${paths}) WHERE id = ?`)
    .bind(...PROGRESS_KEYS.map((key) => progress[key]), planId)
    .run()
}

/**
 * Agent presence saved on a plan row by its plan object. It counts as connected only while the
 * object keeps renewing it, so a lost close cannot leave a plan active.
 */
export function hostedAgentPresence(meta: string | null | undefined, now = Date.now()): { agentConnected: boolean; agentSeenAt: number | null } {
  let parsed: Record<string, unknown> = {}
  try {
    const value = JSON.parse(meta || '{}') as unknown
    if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value as Record<string, unknown>
  } catch {
    // No presence saved.
  }
  const seen = Number(parsed.agentSeenAt)
  const checked = Number(parsed.agentCheckedAt)
  const fresh = Number.isFinite(checked) && now - checked < AGENT_LEASE_MS
  return {
    agentConnected: parsed.agentConnected === true && fresh,
    agentSeenAt: Number.isFinite(seen) && seen > 0 ? seen : null,
  }
}

export type HostedDashboardPlan = PlanRecord & {
  fileUrl?: string
  historyUrl?: string
}

/** Map hosted plan rows onto the same dashboard payload the local control page reads. */
export function hostedDashboard(
  rows: HostedPlanRow[],
  period: DashboardPeriod,
  origin: string,
  now = Date.now(),
): DashboardPayload {
  const plans: HostedDashboardPlan[] = rows.map((row) => {
    const running = row.ended_at == null
    const startedAt = row.started_at
    const endedAt = row.ended_at
    const version = row.version_seq == null ? null : row.version_seq
    const record: HostedDashboardPlan = {
      id: row.id,
      pid: 0,
      title: row.version_title || row.title || 'Living plan',
      summary: null,
      agent: null,
      mode: isPlanMode(row.mode) ? row.mode : 'watch',
      planPath: '',
      directory: `/plans/${row.id}/`,
      cwd: '',
      url: `${origin}/plans/${row.id}/`,
      host: originHost(origin),
      port: 0,
      startedAt,
      heartbeatAt: row.version_at ?? startedAt,
      pendingCount: 0,
      executionActive: false,
      executionStep: version == null ? null : `version ${version}`,
      git: emptyGitSnapshot('stored on this host'),
      status: running ? 'running' : 'executed',
      storedPath: version == null ? null : `version ${version}`,
      endedAt,
      durationMs: Math.max(0, (endedAt ?? now) - startedAt),
      ...(hostedProgress(row.meta) ?? NO_PROGRESS),
      ...(running ? hostedAgentPresence(row.meta, now) : { agentConnected: false, agentSeenAt: null }),
      filesModified: 0,
      outcome: null,
    }
    if (version != null) {
      record.fileUrl = `/plans/${row.id}/document`
      record.historyUrl = `/plans/${row.id}/history`
    }
    return record
  })
  return buildDashboard(plans, period, now)
}

function originHost(origin: string): string {
  try {
    return new URL(origin).host
  } catch {
    return ''
  }
}
