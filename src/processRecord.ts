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

export function runningPlan(record: ProcessRecord, now = Date.now()): PlanRecord {
  return {
    ...record,
    status: 'running',
    storedPath: null,
    endedAt: null,
    durationMs: Math.max(0, now - record.startedAt),
    phaseTotal: 0,
    phaseDone: 0,
    interactionTotal: 0,
    interactionDone: 0,
    completionRatio: 0,
    completionState: 'idle',
    filesModified: record.git.changedFiles,
    outcome: null,
  }
}

export function finishedPlan(
  record: ProcessRecord,
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
