import type { GitSnapshot, PlanRecord } from '../processRecord'
import { emptyGitSnapshot } from '../processRecord'
import { completionStateValues, planModeValues, planStatusValues, reviewOutcomeValues } from './schema'

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
