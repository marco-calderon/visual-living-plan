import { sql } from 'drizzle-orm'
import type { PlanDatabase } from './client.js'
import { parseStoredRun, planRunInsert } from './rows.js'
import { planRuns } from './schema.js'

type ColumnSpec = {
  name: string
  create: string
  /** SQLite ADD COLUMN clause. Primary key is created with the table, not altered in. */
  alter: string | null
}

type KnownTable = 'plans' | 'plan_sessions' | 'plan_runs' | 'processes'

const SHARED_PLAN_COLUMNS: ColumnSpec[] = [
  { name: 'pid', create: 'pid INTEGER', alter: 'pid INTEGER' },
  { name: 'title', create: 'title TEXT NOT NULL', alter: "title TEXT NOT NULL DEFAULT ''" },
  { name: 'summary', create: 'summary TEXT', alter: 'summary TEXT' },
  { name: 'agent', create: 'agent TEXT', alter: 'agent TEXT' },
  { name: 'mode', create: 'mode TEXT NOT NULL', alter: "mode TEXT NOT NULL DEFAULT 'watch'" },
  { name: 'status', create: 'status TEXT NOT NULL', alter: "status TEXT NOT NULL DEFAULT 'running'" },
  { name: 'plan_path', create: 'plan_path TEXT NOT NULL', alter: "plan_path TEXT NOT NULL DEFAULT ''" },
  { name: 'stored_path', create: 'stored_path TEXT', alter: 'stored_path TEXT' },
  { name: 'directory', create: 'directory TEXT NOT NULL', alter: "directory TEXT NOT NULL DEFAULT ''" },
  { name: 'cwd', create: 'cwd TEXT NOT NULL', alter: "cwd TEXT NOT NULL DEFAULT ''" },
  { name: 'url', create: 'url TEXT NOT NULL', alter: "url TEXT NOT NULL DEFAULT ''" },
  { name: 'host', create: 'host TEXT NOT NULL', alter: "host TEXT NOT NULL DEFAULT ''" },
  { name: 'port', create: 'port INTEGER NOT NULL', alter: 'port INTEGER NOT NULL DEFAULT 0' },
  { name: 'started_at', create: 'started_at INTEGER NOT NULL', alter: 'started_at INTEGER NOT NULL DEFAULT 0' },
  { name: 'ended_at', create: 'ended_at INTEGER', alter: 'ended_at INTEGER' },
  { name: 'heartbeat_at', create: 'heartbeat_at INTEGER NOT NULL', alter: 'heartbeat_at INTEGER NOT NULL DEFAULT 0' },
  { name: 'duration_ms', create: 'duration_ms INTEGER NOT NULL DEFAULT 0', alter: 'duration_ms INTEGER NOT NULL DEFAULT 0' },
  { name: 'pending_count', create: 'pending_count INTEGER NOT NULL DEFAULT 0', alter: 'pending_count INTEGER NOT NULL DEFAULT 0' },
  { name: 'phase_total', create: 'phase_total INTEGER NOT NULL DEFAULT 0', alter: 'phase_total INTEGER NOT NULL DEFAULT 0' },
  { name: 'phase_done', create: 'phase_done INTEGER NOT NULL DEFAULT 0', alter: 'phase_done INTEGER NOT NULL DEFAULT 0' },
  { name: 'interaction_total', create: 'interaction_total INTEGER NOT NULL DEFAULT 0', alter: 'interaction_total INTEGER NOT NULL DEFAULT 0' },
  { name: 'interaction_done', create: 'interaction_done INTEGER NOT NULL DEFAULT 0', alter: 'interaction_done INTEGER NOT NULL DEFAULT 0' },
  { name: 'completion_ratio', create: 'completion_ratio INTEGER NOT NULL DEFAULT 0', alter: 'completion_ratio INTEGER NOT NULL DEFAULT 0' },
  { name: 'completion_state', create: "completion_state TEXT NOT NULL DEFAULT 'idle'", alter: "completion_state TEXT NOT NULL DEFAULT 'idle'" },
  { name: 'execution_active', create: 'execution_active INTEGER NOT NULL DEFAULT 0', alter: 'execution_active INTEGER NOT NULL DEFAULT 0' },
  { name: 'execution_step', create: 'execution_step TEXT', alter: 'execution_step TEXT' },
  { name: 'files_modified', create: 'files_modified INTEGER NOT NULL DEFAULT 0', alter: 'files_modified INTEGER NOT NULL DEFAULT 0' },
  { name: 'outcome', create: 'outcome TEXT', alter: 'outcome TEXT' },
  { name: 'git_is_repo', create: 'git_is_repo INTEGER NOT NULL DEFAULT 0', alter: 'git_is_repo INTEGER NOT NULL DEFAULT 0' },
  { name: 'git_root', create: 'git_root TEXT', alter: 'git_root TEXT' },
  { name: 'git_branch', create: 'git_branch TEXT', alter: 'git_branch TEXT' },
  { name: 'git_commit', create: 'git_commit TEXT', alter: 'git_commit TEXT' },
  { name: 'git_dirty', create: 'git_dirty INTEGER NOT NULL DEFAULT 0', alter: 'git_dirty INTEGER NOT NULL DEFAULT 0' },
  { name: 'git_ahead', create: 'git_ahead INTEGER NOT NULL DEFAULT 0', alter: 'git_ahead INTEGER NOT NULL DEFAULT 0' },
  { name: 'git_behind', create: 'git_behind INTEGER NOT NULL DEFAULT 0', alter: 'git_behind INTEGER NOT NULL DEFAULT 0' },
  { name: 'git_changed_files', create: 'git_changed_files INTEGER NOT NULL DEFAULT 0', alter: 'git_changed_files INTEGER NOT NULL DEFAULT 0' },
  { name: 'git_paths', create: "git_paths TEXT NOT NULL DEFAULT '[]'", alter: "git_paths TEXT NOT NULL DEFAULT '[]'" },
  { name: 'git_summary', create: "git_summary TEXT NOT NULL DEFAULT ''", alter: "git_summary TEXT NOT NULL DEFAULT ''" },
]

/** SQL columns for `plans`. Names match `src/db/schema.ts`. */
export const PLAN_COLUMNS: ColumnSpec[] = [
  { name: 'id', create: 'id TEXT PRIMARY KEY', alter: null },
  ...SHARED_PLAN_COLUMNS,
]

/** SQL columns for typed `plan_runs`. `id` is the plan id; `run_id` is the primary key. */
export const PLAN_RUN_COLUMNS: ColumnSpec[] = [
  { name: 'run_id', create: 'run_id TEXT PRIMARY KEY', alter: null },
  { name: 'id', create: 'id TEXT NOT NULL', alter: "id TEXT NOT NULL DEFAULT ''" },
  ...SHARED_PLAN_COLUMNS,
]

export const PLAN_SESSION_COLUMNS: ColumnSpec[] = [
  { name: 'id', create: 'id TEXT PRIMARY KEY', alter: null },
  { name: 'token', create: 'token TEXT NOT NULL', alter: "token TEXT NOT NULL DEFAULT ''" },
  { name: 'plan_path', create: 'plan_path TEXT NOT NULL UNIQUE', alter: "plan_path TEXT NOT NULL DEFAULT ''" },
  { name: 'mode', create: 'mode TEXT NOT NULL', alter: "mode TEXT NOT NULL DEFAULT 'watch'" },
  { name: 'iteration', create: 'iteration INTEGER NOT NULL DEFAULT 1', alter: 'iteration INTEGER NOT NULL DEFAULT 1' },
  { name: 'cwd', create: 'cwd TEXT NOT NULL', alter: "cwd TEXT NOT NULL DEFAULT ''" },
  { name: 'config_path', create: 'config_path TEXT', alter: 'config_path TEXT' },
  { name: 'responses_json', create: "responses_json TEXT NOT NULL DEFAULT '{}'", alter: "responses_json TEXT NOT NULL DEFAULT '{}'" },
  { name: 'execution_json', create: "execution_json TEXT NOT NULL DEFAULT '{}'", alter: "execution_json TEXT NOT NULL DEFAULT '{}'" },
  { name: 'review_json', create: 'review_json TEXT', alter: 'review_json TEXT' },
  { name: 'started_at', create: 'started_at INTEGER NOT NULL', alter: 'started_at INTEGER NOT NULL DEFAULT 0' },
  { name: 'last_seen_at', create: 'last_seen_at INTEGER NOT NULL', alter: 'last_seen_at INTEGER NOT NULL DEFAULT 0' },
]

const COPY_FROM_PROCESSES = `
  INSERT INTO plans (
    id, pid, title, summary, agent, mode, status, plan_path, stored_path, directory, cwd,
    url, host, port, started_at, ended_at, heartbeat_at, duration_ms, pending_count,
    phase_total, phase_done, interaction_total, interaction_done, completion_ratio, completion_state,
    execution_active, execution_step, files_modified, outcome,
    git_is_repo, git_root, git_branch, git_commit, git_dirty, git_ahead, git_behind,
    git_changed_files, git_paths, git_summary
  )
  SELECT
    id, pid, title, summary, agent, mode, 'running', plan_path, NULL, directory, cwd,
    url, host, port, started_at, NULL, heartbeat_at, 0, pending_count,
    0, 0, 0, 0, 0, 'idle',
    execution_active, execution_step, git_changed_files, NULL,
    git_is_repo, git_root, git_branch, git_commit, git_dirty, git_ahead, git_behind,
    git_changed_files, git_paths, git_summary
  FROM processes
  WHERE NOT EXISTS (SELECT 1 FROM plans WHERE plans.id = processes.id)
`

/** Schema changes stay as SQL text. Drizzle runs them; table rows are read and written with the query builder. */
function runSql(db: PlanDatabase, statement: string): void {
  db.run(sql.raw(statement))
}

function tableExists(db: PlanDatabase, name: string): boolean {
  const rows = db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${name}`,
  )
  return rows.length > 0
}

function columnNames(db: PlanDatabase, table: KnownTable): Set<string> {
  const rows = db.all<{ name: string }>(sql.raw(`PRAGMA table_info(${table})`))
  return new Set(rows.map((row) => row.name))
}

function createTableSql(table: KnownTable, columns: ColumnSpec[]): string {
  return `CREATE TABLE ${table} (\n${columns.map((column) => column.create).join(',\n')}\n)`
}

function ensureTable(db: PlanDatabase, table: KnownTable, columns: ColumnSpec[]): void {
  if (!tableExists(db, table)) {
    runSql(db, createTableSql(table, columns))
    return
  }
  const present = columnNames(db, table)
  for (const column of columns) {
    if (!column.alter || present.has(column.name)) continue
    runSql(db, `ALTER TABLE ${table} ADD COLUMN ${column.alter}`)
  }
}

function foldProcesses(db: PlanDatabase): void {
  if (!tableExists(db, 'processes')) return
  db.transaction((tx) => {
    runSql(tx, COPY_FROM_PROCESSES)
    runSql(tx, 'DROP TABLE processes')
  })
}

type LegacyRunRow = {
  run_id: string
  started_at: number
  payload: string
}

function migrateLegacyRuns(db: PlanDatabase): void {
  if (!tableExists(db, 'plan_runs')) return
  const present = columnNames(db, 'plan_runs')
  if (!present.has('payload') || present.has('title')) return
  const legacy = db.all<LegacyRunRow>(sql`SELECT run_id, started_at, payload FROM plan_runs`)
  const parsed = legacy.flatMap((row) => {
    const record = parseStoredRun(row.payload)
    return record ? [{ runId: row.run_id, record }] : []
  })
  db.transaction((tx) => {
    runSql(tx, 'ALTER TABLE plan_runs RENAME TO plan_runs_legacy')
    runSql(tx, createTableSql('plan_runs', PLAN_RUN_COLUMNS))
    for (const row of parsed) {
      tx.insert(planRuns).values(planRunInsert(row.record, row.runId)).run()
    }
    runSql(tx, 'DROP TABLE plan_runs_legacy')
  })
}

/** Create `plans`, add any columns added after an older build, and fold in legacy tables. */
export function migratePlanDatabase(db: PlanDatabase): void {
  ensureTable(db, 'plans', PLAN_COLUMNS)
  runSql(db, 'CREATE INDEX IF NOT EXISTS plans_started_at_idx ON plans (started_at)')
  runSql(db, 'CREATE INDEX IF NOT EXISTS plans_status_idx ON plans (status)')
  foldProcesses(db)
  ensureTable(db, 'plan_sessions', PLAN_SESSION_COLUMNS)
  migrateLegacyRuns(db)
  ensureTable(db, 'plan_runs', PLAN_RUN_COLUMNS)
  runSql(db, 'CREATE INDEX IF NOT EXISTS plan_runs_started_at_idx ON plan_runs (started_at)')
}
