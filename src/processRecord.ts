export type GitSnapshot = {
  isRepo: boolean
  root: string | null
  branch: string | null
  commit: string | null
  dirty: boolean
  ahead: number
  behind: number
  changedFiles: number
  changedPaths: string[]
  summary: string
}

export type PlanMode = 'watch' | 'comment' | 'review'

export function isPlanMode(value: unknown): value is PlanMode {
  return value === 'watch' || value === 'comment' || value === 'review'
}

export type ProcessRecord = {
  id: string
  pid: number
  title: string
  summary: string | null
  agent: string | null
  mode: PlanMode
  planPath: string
  directory: string
  cwd: string
  url: string
  host: string
  port: number
  startedAt: number
  heartbeatAt: number
  pendingCount: number
  executionActive: boolean
  executionStep: string | null
  git: GitSnapshot
  /**
   * An agent holds the plan's agent stream open: a `serve`, `events`, `wait`, `watch`, or
   * `review` command is waiting on it. A plan without it is open but idle.
   */
  agentConnected?: boolean
  /** When an agent stream last opened or closed. */
  agentSeenAt?: number | null
}

export type ProcessRegistration = {
  id: string
  pid: number
  title: string
  summary?: string | null
  agent?: string | null
  mode: PlanMode
  planPath: string
  directory: string
  cwd: string
  url: string
  host: string
  port: number
  pendingCount?: number
  executionActive?: boolean
  executionStep?: string | null
  git?: GitSnapshot
  phaseTotal?: number
  phaseDone?: number
  interactionTotal?: number
  interactionDone?: number
  completionRatio?: number
  completionState?: CompletionState
  filesModified?: number
}

export type PlanStatus = 'running' | 'executed' | 'interrupted'

export type CompletionState = 'idle' | 'in_progress' | 'partial' | 'complete'

export type ReviewOutcome = 'approve' | 'deny' | 'iterate'

export type PlanRecord = ProcessRecord & {
  status: PlanStatus
  storedPath: string | null
  endedAt: number | null
  durationMs: number
  phaseTotal: number
  phaseDone: number
  interactionTotal: number
  interactionDone: number
  completionRatio: number
  completionState: CompletionState
  filesModified: number
  outcome: ReviewOutcome | null
}

export type ProcessPulse = {
  at?: number
  title?: string
  summary?: string | null
  agent?: string | null
  pendingCount?: number
  executionActive?: boolean
  executionStep?: string | null
  git?: GitSnapshot
  phaseTotal?: number
  phaseDone?: number
  interactionTotal?: number
  interactionDone?: number
  completionRatio?: number
  completionState?: CompletionState
  filesModified?: number
}

/** Plan progress as the dashboard shows it. */
export type ProgressFields = Pick<
  PlanRecord,
  'phaseTotal' | 'phaseDone' | 'interactionTotal' | 'interactionDone' | 'completionRatio' | 'completionState'
>

const COMPLETION_STATES: CompletionState[] = ['idle', 'in_progress', 'partial', 'complete']

function count(value: unknown): number | undefined {
  const number = Number(value)
  return value != null && value !== '' && Number.isFinite(number) ? Math.max(0, Math.round(number)) : undefined
}

/** The valid progress fields in an untrusted object, such as a heartbeat body or a stored row. */
export function readProgress(value: unknown): Partial<ProgressFields> {
  if (!value || typeof value !== 'object') return {}
  const raw = value as Record<string, unknown>
  const progress: Partial<ProgressFields> = {}
  for (const key of ['phaseTotal', 'phaseDone', 'interactionTotal', 'interactionDone'] as const) {
    const number = count(raw[key])
    if (number !== undefined) progress[key] = number
  }
  const ratio = count(raw.completionRatio)
  if (ratio !== undefined) progress.completionRatio = Math.min(100, ratio)
  if (COMPLETION_STATES.includes(raw.completionState as CompletionState)) {
    progress.completionState = raw.completionState as CompletionState
  }
  return progress
}

/** A running plan. Progress the record already carries is kept; anything missing starts at zero. */
export function runningPlan(record: ProcessRecord & Partial<ProgressFields>, now = Date.now()): PlanRecord {
  return {
    ...record,
    status: 'running',
    storedPath: null,
    endedAt: null,
    durationMs: Math.max(0, now - record.startedAt),
    phaseTotal: record.phaseTotal ?? 0,
    phaseDone: record.phaseDone ?? 0,
    interactionTotal: record.interactionTotal ?? 0,
    interactionDone: record.interactionDone ?? 0,
    completionRatio: record.completionRatio ?? 0,
    completionState: record.completionState ?? 'idle',
    filesModified: record.git.changedFiles,
    outcome: null,
  }
}

export function finishedPlan(
  record: ProcessRecord & Partial<ProgressFields>,
  status: 'executed' | 'interrupted',
  outcome: ReviewOutcome | null = null,
  now = Date.now(),
): PlanRecord {
  return {
    ...runningPlan(record, now),
    status,
    endedAt: now,
    durationMs: Math.max(0, now - record.startedAt),
    outcome,
  }
}

export function emptyGitSnapshot(summary = 'not a git repository'): GitSnapshot {
  return {
    isRepo: false,
    root: null,
    branch: null,
    commit: null,
    dirty: false,
    ahead: 0,
    behind: 0,
    changedFiles: 0,
    changedPaths: [],
    summary,
  }
}
