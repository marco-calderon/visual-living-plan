import {
  emptyGitSnapshot,
  type CompletionState,
  type GitSnapshot,
  type PlanRecord,
  type ProcessRecord,
  type ReviewOutcome,
} from '../processRecord'

/** Configuration stored in `plans.meta` and `plan_runs.meta`. Both hosts read the same object. */
export type PlanMeta = {
  pid: number | null
  summary: string | null
  agent: string | null
  storedPath: string | null
  directory: string
  cwd: string
  url: string
  host: string
  port: number
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
  git: GitSnapshot
  iteration: number
  configPath: string | null
  responses: unknown
  execution: unknown
  review: unknown
  comments: unknown
  tier: string | null
  lastSeenAt: number | null
}

/** Account appearance. Local rows stay empty. */
export type SettingsMeta = {
  accent: string
  pageWidth: string
  diffsTheme: string
  wrapCode: boolean
}

export function emptyMeta(patch: Partial<PlanMeta> = {}): PlanMeta {
  const { git, ...rest } = patch
  return {
    pid: null,
    summary: null,
    agent: null,
    storedPath: null,
    directory: '',
    cwd: '',
    url: '',
    host: '',
    port: 0,
    durationMs: 0,
    pendingCount: 0,
    phaseTotal: 0,
    phaseDone: 0,
    interactionTotal: 0,
    interactionDone: 0,
    completionRatio: 0,
    completionState: 'idle',
    executionActive: false,
    executionStep: null,
    filesModified: 0,
    outcome: null,
    iteration: 1,
    configPath: null,
    responses: {},
    execution: {},
    review: null,
    comments: [],
    tier: null,
    lastSeenAt: null,
    ...rest,
    git: { ...emptyGitSnapshot(), ...(git ?? {}) },
  }
}

export function metaFromProcess(record: ProcessRecord): PlanMeta {
  const git = record.git ?? emptyGitSnapshot()
  return emptyMeta({
    pid: record.pid,
    summary: record.summary,
    agent: record.agent,
    directory: record.directory,
    cwd: record.cwd,
    url: record.url,
    host: record.host,
    port: record.port,
    pendingCount: record.pendingCount,
    executionActive: record.executionActive,
    executionStep: record.executionStep,
    filesModified: git.changedFiles,
    git,
  })
}

export function metaFromRecord(record: PlanRecord): PlanMeta {
  const git = record.git ?? emptyGitSnapshot()
  return emptyMeta({
    pid: record.pid,
    summary: record.summary,
    agent: record.agent,
    storedPath: record.storedPath,
    directory: record.directory,
    cwd: record.cwd,
    url: record.url,
    host: record.host,
    port: record.port,
    durationMs: record.durationMs,
    pendingCount: record.pendingCount,
    phaseTotal: record.phaseTotal,
    phaseDone: record.phaseDone,
    interactionTotal: record.interactionTotal,
    interactionDone: record.interactionDone,
    completionRatio: record.completionRatio,
    completionState: record.completionState,
    executionActive: record.executionActive,
    executionStep: record.executionStep,
    filesModified: record.filesModified,
    outcome: record.outcome,
    git,
  })
}

/** Progress fields stay when a live process row is written again. */
export function keepProgress(current: PlanMeta, incoming: PlanMeta): PlanMeta {
  return {
    ...incoming,
    storedPath: current.storedPath,
    durationMs: current.durationMs,
    phaseTotal: current.phaseTotal,
    phaseDone: current.phaseDone,
    interactionTotal: current.interactionTotal,
    interactionDone: current.interactionDone,
    completionRatio: current.completionRatio,
    completionState: current.completionState,
    outcome: current.outcome,
    iteration: current.iteration,
    configPath: current.configPath,
    responses: current.responses,
    execution: current.execution,
    review: current.review,
    comments: current.comments,
    tier: current.tier,
    lastSeenAt: current.lastSeenAt,
  }
}

export function readMeta(value: unknown): PlanMeta {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown
    } catch {
      parsed = null
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyMeta()
  const record = parsed as Partial<PlanMeta>
  return emptyMeta({
    ...record,
    git: record.git ? { ...emptyGitSnapshot(), ...record.git } : emptyGitSnapshot(),
  })
}
