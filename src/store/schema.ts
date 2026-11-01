import type { CompletionState, PlanMode, PlanStatus, ReviewOutcome } from '../processRecord'

/**
 * Local service rows. Column names match the SQL in `migrate.ts`.
 * Hosted plan documents use the D1 tables in `src/migrations`, not this catalog.
 */
export const planModeValues = ['watch', 'comment', 'review'] as const
export const planStatusValues = ['running', 'executed', 'interrupted'] as const
export const completionStateValues = ['idle', 'in_progress', 'partial', 'complete'] as const
export const reviewOutcomeValues = ['approve', 'deny', 'iterate'] as const

type ExactEnum<TValues extends readonly string[], TUnion extends string> = [TUnion] extends [TValues[number]]
  ? [TValues[number]] extends [TUnion]
    ? true
    : never
  : never
type AssertExact<T extends true> = T

type _planModes = AssertExact<ExactEnum<typeof planModeValues, PlanMode>>
type _planStatuses = AssertExact<ExactEnum<typeof planStatusValues, PlanStatus>>
type _completionStates = AssertExact<ExactEnum<typeof completionStateValues, CompletionState>>
type _reviewOutcomes = AssertExact<ExactEnum<typeof reviewOutcomeValues, ReviewOutcome>>

export type FieldKind = 'text' | 'integer' | 'boolean' | 'json'

export type Field = {
  name: string
  key: string
  kind: FieldKind
}

export type PlanRow = {
  id: string
  pid: number | null
  title: string
  summary: string | null
  agent: string | null
  mode: PlanMode
  status: PlanStatus
  planPath: string
  storedPath: string | null
  directory: string
  cwd: string
  url: string
  host: string
  port: number
  startedAt: number
  endedAt: number | null
  heartbeatAt: number
  durationMs: number
  pendingCount: number
  phaseTotal: number
  phaseDone: number
  interactionTotal: number
  interactionDone: number
  completionRatio: number
  completionState: CompletionState
  executionActive: boolean
  executionStep: string | null
  filesModified: number
  outcome: ReviewOutcome | null
  gitIsRepo: boolean
  gitRoot: string | null
  gitBranch: string | null
  gitCommit: string | null
  gitDirty: boolean
  gitAhead: number
  gitBehind: number
  gitChangedFiles: number
  gitPaths: string[]
  gitSummary: string
}

export type PlanInsert = PlanRow
export type PlanRunRow = PlanRow & { runId: string }
export type PlanRunInsert = PlanRunRow

export const PLAN_FIELDS: Field[] = [
  { name: 'id', key: 'id', kind: 'text' },
  { name: 'pid', key: 'pid', kind: 'integer' },
  { name: 'title', key: 'title', kind: 'text' },
  { name: 'summary', key: 'summary', kind: 'text' },
  { name: 'agent', key: 'agent', kind: 'text' },
  { name: 'mode', key: 'mode', kind: 'text' },
  { name: 'status', key: 'status', kind: 'text' },
  { name: 'plan_path', key: 'planPath', kind: 'text' },
  { name: 'stored_path', key: 'storedPath', kind: 'text' },
  { name: 'directory', key: 'directory', kind: 'text' },
  { name: 'cwd', key: 'cwd', kind: 'text' },
  { name: 'url', key: 'url', kind: 'text' },
  { name: 'host', key: 'host', kind: 'text' },
  { name: 'port', key: 'port', kind: 'integer' },
  { name: 'started_at', key: 'startedAt', kind: 'integer' },
  { name: 'ended_at', key: 'endedAt', kind: 'integer' },
  { name: 'heartbeat_at', key: 'heartbeatAt', kind: 'integer' },
  { name: 'duration_ms', key: 'durationMs', kind: 'integer' },
  { name: 'pending_count', key: 'pendingCount', kind: 'integer' },
  { name: 'phase_total', key: 'phaseTotal', kind: 'integer' },
  { name: 'phase_done', key: 'phaseDone', kind: 'integer' },
  { name: 'interaction_total', key: 'interactionTotal', kind: 'integer' },
  { name: 'interaction_done', key: 'interactionDone', kind: 'integer' },
  { name: 'completion_ratio', key: 'completionRatio', kind: 'integer' },
  { name: 'completion_state', key: 'completionState', kind: 'text' },
  { name: 'execution_active', key: 'executionActive', kind: 'boolean' },
  { name: 'execution_step', key: 'executionStep', kind: 'text' },
  { name: 'files_modified', key: 'filesModified', kind: 'integer' },
  { name: 'outcome', key: 'outcome', kind: 'text' },
  { name: 'git_is_repo', key: 'gitIsRepo', kind: 'boolean' },
  { name: 'git_root', key: 'gitRoot', kind: 'text' },
  { name: 'git_branch', key: 'gitBranch', kind: 'text' },
  { name: 'git_commit', key: 'gitCommit', kind: 'text' },
  { name: 'git_dirty', key: 'gitDirty', kind: 'boolean' },
  { name: 'git_ahead', key: 'gitAhead', kind: 'integer' },
  { name: 'git_behind', key: 'gitBehind', kind: 'integer' },
  { name: 'git_changed_files', key: 'gitChangedFiles', kind: 'integer' },
  { name: 'git_paths', key: 'gitPaths', kind: 'json' },
  { name: 'git_summary', key: 'gitSummary', kind: 'text' },
]

export const RUN_FIELDS: Field[] = [{ name: 'run_id', key: 'runId', kind: 'text' }, ...PLAN_FIELDS]

export const SESSION_FIELDS: Field[] = [
  { name: 'id', key: 'id', kind: 'text' },
  { name: 'token', key: 'token', kind: 'text' },
  { name: 'plan_path', key: 'planPath', kind: 'text' },
  { name: 'mode', key: 'mode', kind: 'text' },
  { name: 'iteration', key: 'iteration', kind: 'integer' },
  { name: 'cwd', key: 'cwd', kind: 'text' },
  { name: 'config_path', key: 'configPath', kind: 'text' },
  { name: 'responses_json', key: 'responsesJson', kind: 'text' },
  { name: 'execution_json', key: 'executionJson', kind: 'text' },
  { name: 'review_json', key: 'reviewJson', kind: 'text' },
  { name: 'comments_json', key: 'commentsJson', kind: 'text' },
  { name: 'started_at', key: 'startedAt', kind: 'integer' },
  { name: 'last_seen_at', key: 'lastSeenAt', kind: 'integer' },
]

export const EVENT_FIELDS: Field[] = [
  { name: 'id', key: 'id', kind: 'text' },
  { name: 'plan_id', key: 'planId', kind: 'text' },
  { name: 'seq', key: 'seq', kind: 'integer' },
  { name: 'event', key: 'event', kind: 'text' },
  { name: 'data_json', key: 'dataJson', kind: 'text' },
  { name: 'created_at', key: 'createdAt', kind: 'integer' },
  { name: 'delivered_at', key: 'deliveredAt', kind: 'integer' },
]

/** Columns replaced when a live plan row already exists. Progress and the first start time stay. */
export const PLAN_KEEP = [
  'started_at',
  'status',
  'stored_path',
  'ended_at',
  'duration_ms',
  'phase_total',
  'phase_done',
  'interaction_total',
  'interaction_done',
  'completion_ratio',
  'completion_state',
  'outcome',
] as const
