import { buildDashboard, type DashboardPayload, type DashboardPeriod } from '../../src/dashboard'
import { emptyGitSnapshot, isPlanMode, type PlanRecord } from '../../src/processRecord'

export type HostedPlanRow = {
  id: string
  title: string | null
  mode: string
  closed_at: number | null
  created_at: number
  version_seq: number | null
  version_title: string | null
  version_at: number | null
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
    const running = row.closed_at == null
    const startedAt = row.created_at
    const endedAt = row.closed_at
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
      host: new URL(origin).host,
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
      phaseTotal: 0,
      phaseDone: 0,
      interactionTotal: 0,
      interactionDone: 0,
      completionRatio: 0,
      completionState: 'idle',
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
