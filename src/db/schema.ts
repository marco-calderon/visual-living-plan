import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { CompletionState, PlanStatus, ReviewOutcome } from '../processRecord.js'

/**
 * Live private-server registration.
 * One row is the current serve for that id. Finished history lives in `plan_runs`.
 * `processes` was the previous table; `migratePlanDatabase` copies those rows here.
 */
export const planModeValues = ['watch', 'review'] as const
export const planStatusValues = ['running', 'executed', 'interrupted'] as const
export const completionStateValues = ['idle', 'in_progress', 'partial', 'complete'] as const
export const reviewOutcomeValues = ['approve', 'deny', 'iterate'] as const

type ExactEnum<TValues extends readonly string[], TUnion extends string> = [TUnion] extends [TValues[number]]
  ? [TValues[number]] extends [TUnion]
    ? true
    : never
  : never
type AssertExact<T extends true> = T

type _planModes = AssertExact<ExactEnum<typeof planModeValues, 'watch' | 'review'>>
type _planStatuses = AssertExact<ExactEnum<typeof planStatusValues, PlanStatus>>
type _completionStates = AssertExact<ExactEnum<typeof completionStateValues, CompletionState>>
type _reviewOutcomes = AssertExact<ExactEnum<typeof reviewOutcomeValues, ReviewOutcome>>

function planColumns() {
  return {
    id: text('id').notNull(),
    pid: integer('pid'),
    title: text('title').notNull(),
    summary: text('summary'),
    agent: text('agent'),
    mode: text('mode', { enum: planModeValues }).notNull(),
    status: text('status', { enum: planStatusValues }).notNull(),
    planPath: text('plan_path').notNull(),
    storedPath: text('stored_path'),
    directory: text('directory').notNull(),
    cwd: text('cwd').notNull(),
    url: text('url').notNull(),
    host: text('host').notNull(),
    port: integer('port').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    heartbeatAt: integer('heartbeat_at').notNull(),
    durationMs: integer('duration_ms').notNull().default(0),
    pendingCount: integer('pending_count').notNull().default(0),
    phaseTotal: integer('phase_total').notNull().default(0),
    phaseDone: integer('phase_done').notNull().default(0),
    interactionTotal: integer('interaction_total').notNull().default(0),
    interactionDone: integer('interaction_done').notNull().default(0),
    completionRatio: integer('completion_ratio').notNull().default(0),
    completionState: text('completion_state', { enum: completionStateValues }).notNull().default('idle'),
    executionActive: integer('execution_active', { mode: 'boolean' }).notNull().default(false),
    executionStep: text('execution_step'),
    filesModified: integer('files_modified').notNull().default(0),
    outcome: text('outcome', { enum: reviewOutcomeValues }),
    gitIsRepo: integer('git_is_repo', { mode: 'boolean' }).notNull().default(false),
    gitRoot: text('git_root'),
    gitBranch: text('git_branch'),
    gitCommit: text('git_commit'),
    gitDirty: integer('git_dirty', { mode: 'boolean' }).notNull().default(false),
    gitAhead: integer('git_ahead').notNull().default(0),
    gitBehind: integer('git_behind').notNull().default(0),
    gitChangedFiles: integer('git_changed_files').notNull().default(0),
    gitPaths: text('git_paths', { mode: 'json' }).$type<string[]>().notNull().$defaultFn(() => []),
    gitSummary: text('git_summary').notNull().default(''),
  }
}

export const plans = sqliteTable(
  'plans',
  {
    ...planColumns(),
    id: text('id').primaryKey(),
  },
  (table) => [index('plans_started_at_idx').on(table.startedAt), index('plans_status_idx').on(table.status)],
)

/** Finished serve/review runs. `run_id` is `${id}:${startedAt}` so a later registration can reuse `id`. */
export const planRuns = sqliteTable(
  'plan_runs',
  {
    runId: text('run_id').primaryKey(),
    ...planColumns(),
  },
  (table) => [index('plan_runs_started_at_idx').on(table.startedAt)],
)

/** Hosted plan session state that is not in the plan file. */
export const planSessions = sqliteTable('plan_sessions', {
  id: text('id').primaryKey(),
  token: text('token').notNull(),
  planPath: text('plan_path').notNull().unique(),
  mode: text('mode', { enum: planModeValues }).notNull(),
  iteration: integer('iteration').notNull().default(1),
  cwd: text('cwd').notNull(),
  configPath: text('config_path'),
  responsesJson: text('responses_json').notNull().default('{}'),
  executionJson: text('execution_json').notNull().default('{}'),
  reviewJson: text('review_json'),
  startedAt: integer('started_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
})

export type PlanRow = typeof plans.$inferSelect
export type PlanInsert = typeof plans.$inferInsert
export type PlanRunRow = typeof planRuns.$inferSelect
export type PlanRunInsert = typeof planRuns.$inferInsert
export type PlanSessionRow = typeof planSessions.$inferSelect
export type PlanSessionInsert = typeof planSessions.$inferInsert
