import type { GitSnapshot, PlanRecord, ProcessRecord } from '../processRecord'
import { emptyGitSnapshot, isPlanMode } from '../processRecord'
import {
  completionStateValues,
  planModeValues,
  planStatusValues,
  reviewOutcomeValues,
  type PlanInsert,
  type PlanRow,
  type PlanRunInsert,
  type PlanRunRow,
} from './schema'

function oneOf<T extends string>(values: readonly T[], value: unknown): T | undefined {
  if (typeof value !== 'string') return undefined
  for (const candidate of values) {
    if (candidate === value) return candidate
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function gitColumns(git: GitSnapshot) {
  return {
    gitIsRepo: git.isRepo,
    gitRoot: git.root,
    gitBranch: git.branch,
    gitCommit: git.commit,
    gitDirty: git.dirty,
    gitAhead: git.ahead,
    gitBehind: git.behind,
    gitChangedFiles: git.changedFiles,
    gitPaths: git.changedPaths,
    gitSummary: git.summary,
  }
}

function gitFromRow(row: PlanRow): GitSnapshot {
  return {
    isRepo: row.gitIsRepo,
    root: row.gitRoot,
    branch: row.gitBranch,
    commit: row.gitCommit,
    dirty: row.gitDirty,
    ahead: row.gitAhead,
    behind: row.gitBehind,
    changedFiles: row.gitChangedFiles,
    changedPaths: stringList(row.gitPaths),
    summary: row.gitSummary,
  }
}

export function planInsertFromProcess(record: ProcessRecord): PlanInsert {
  const git = record.git ?? emptyGitSnapshot()
  return {
    id: record.id,
    pid: record.pid,
    title: record.title,
    summary: record.summary,
    agent: record.agent,
    mode: record.mode,
    status: 'running',
    planPath: record.planPath,
    storedPath: null,
    directory: record.directory,
    cwd: record.cwd,
    url: record.url,
    host: record.host,
    port: record.port,
    startedAt: record.startedAt,
    endedAt: null,
    heartbeatAt: record.heartbeatAt,
    durationMs: 0,
    pendingCount: record.pendingCount,
    phaseTotal: 0,
    phaseDone: 0,
    interactionTotal: 0,
    interactionDone: 0,
    completionRatio: 0,
    completionState: 'idle',
    executionActive: record.executionActive,
    executionStep: record.executionStep,
    filesModified: git.changedFiles,
    outcome: null,
    ...gitColumns(git),
  }
}

export function planRunInsert(record: PlanRecord, runId = `${record.id}:${record.startedAt}`): PlanRunInsert {
  const git = record.git ?? emptyGitSnapshot()
  return {
    runId,
    id: record.id,
    pid: record.pid,
    title: record.title,
    summary: record.summary,
    agent: record.agent,
    mode: record.mode,
    status: record.status,
    planPath: record.planPath,
    storedPath: record.storedPath,
    directory: record.directory,
    cwd: record.cwd,
    url: record.url,
    host: record.host,
    port: record.port,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    heartbeatAt: record.heartbeatAt,
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
    ...gitColumns(git),
  }
}

export function planRowToProcess(row: PlanRow): ProcessRecord {
  return {
    id: row.id,
    pid: row.pid ?? 0,
    title: row.title,
    summary: row.summary,
    agent: row.agent,
    mode: isPlanMode(row.mode) ? row.mode : 'watch',
    planPath: row.planPath,
    directory: row.directory,
    cwd: row.cwd,
    url: row.url,
    host: row.host,
    port: row.port,
    startedAt: row.startedAt,
    heartbeatAt: row.heartbeatAt,
    pendingCount: row.pendingCount,
    executionActive: row.executionActive,
    executionStep: row.executionStep,
    git: gitFromRow(row),
  }
}

export function planRunRowToRecord(row: PlanRunRow): PlanRecord {
  return {
    ...planRowToProcess(row),
    status: row.status,
    storedPath: row.storedPath,
    endedAt: row.endedAt,
    durationMs: row.durationMs,
    phaseTotal: row.phaseTotal,
    phaseDone: row.phaseDone,
    interactionTotal: row.interactionTotal,
    interactionDone: row.interactionDone,
    completionRatio: row.completionRatio,
    completionState: row.completionState,
    filesModified: row.filesModified,
    outcome: row.outcome,
  }
}

function parseGit(value: unknown): GitSnapshot | undefined {
  if (!isRecord(value)) return undefined
  return {
    isRepo: value.isRepo === true,
    root: stringOrNull(value.root),
    branch: stringOrNull(value.branch),
    commit: stringOrNull(value.commit),
    dirty: value.dirty === true,
    ahead: numberOrZero(value.ahead),
    behind: numberOrZero(value.behind),
    changedFiles: numberOrZero(value.changedFiles),
    changedPaths: stringList(value.changedPaths),
    summary: typeof value.summary === 'string' ? value.summary : '',
  }
}

/** Read a `plan_runs.payload` blob written before runs had typed columns. */
export function parseStoredRun(payload: string): PlanRecord | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return undefined
  }
  if (!isRecord(parsed)) return undefined
  const mode = oneOf(planModeValues, parsed.mode)
  const status = oneOf(planStatusValues, parsed.status)
  const completionState = oneOf(completionStateValues, parsed.completionState) ?? 'idle'
  const outcome = parsed.outcome == null ? null : oneOf(reviewOutcomeValues, parsed.outcome)
  if (!mode || !status) return undefined
  if (parsed.outcome != null && !outcome) return undefined
  if (typeof parsed.id !== 'string' || typeof parsed.title !== 'string') return undefined
  if (typeof parsed.planPath !== 'string' || typeof parsed.directory !== 'string') return undefined
  if (typeof parsed.cwd !== 'string' || typeof parsed.url !== 'string' || typeof parsed.host !== 'string') {
    return undefined
  }
  return {
    id: parsed.id,
    pid: numberOrZero(parsed.pid),
    title: parsed.title,
    summary: stringOrNull(parsed.summary),
    agent: stringOrNull(parsed.agent),
    mode,
    status,
    planPath: parsed.planPath,
    storedPath: stringOrNull(parsed.storedPath),
    directory: parsed.directory,
    cwd: parsed.cwd,
    url: parsed.url,
    host: parsed.host,
    port: numberOrZero(parsed.port),
    startedAt: numberOrZero(parsed.startedAt),
    endedAt: typeof parsed.endedAt === 'number' ? parsed.endedAt : null,
    heartbeatAt: numberOrZero(parsed.heartbeatAt),
    durationMs: numberOrZero(parsed.durationMs),
    pendingCount: numberOrZero(parsed.pendingCount),
    phaseTotal: numberOrZero(parsed.phaseTotal),
    phaseDone: numberOrZero(parsed.phaseDone),
    interactionTotal: numberOrZero(parsed.interactionTotal),
    interactionDone: numberOrZero(parsed.interactionDone),
    completionRatio: numberOrZero(parsed.completionRatio),
    completionState,
    executionActive: parsed.executionActive === true || parsed.executionActive === 1,
    executionStep: stringOrNull(parsed.executionStep),
    filesModified: numberOrZero(parsed.filesModified),
    outcome: outcome ?? null,
    git: parseGit(parsed.git) ?? emptyGitSnapshot(),
  }
}
