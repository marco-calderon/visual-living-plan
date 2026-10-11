import type { Database } from 'bun:sqlite'

type ColumnSpec = {
  name: string
  create: string
  /** SQLite ADD COLUMN clause. Primary key is created with the table, not altered in. */
  alter: string | null
}

/** SQL columns for `plans`. Names match `src/db/schema.ts`. */
export const PLAN_COLUMNS: ColumnSpec[] = [
  { name: 'id', create: 'id TEXT PRIMARY KEY', alter: null },
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

function tableExists(sqlite: Database, name: string): boolean {
  const row = sqlite
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { name: string } | null
  return Boolean(row)
}

function columnNames(sqlite: Database, table: string): Set<string> {
  const rows = sqlite.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return new Set(rows.map((row) => row.name))
}

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

/** Create `plans`, add any columns added after an older build, and fold in the legacy `processes` table. */
export function migratePlanDatabase(sqlite: Database): void {
  if (!tableExists(sqlite, 'plans')) {
    sqlite.exec(`CREATE TABLE plans (\n${PLAN_COLUMNS.map((column) => column.create).join(',\n')}\n)`)
  } else {
    const present = columnNames(sqlite, 'plans')
    for (const column of PLAN_COLUMNS) {
      if (!column.alter || present.has(column.name)) continue
      sqlite.exec(`ALTER TABLE plans ADD COLUMN ${column.alter}`)
    }
  }

  sqlite.exec('CREATE INDEX IF NOT EXISTS plans_started_at_idx ON plans (started_at)')
  sqlite.exec('CREATE INDEX IF NOT EXISTS plans_status_idx ON plans (status)')

  if (!tableExists(sqlite, 'processes')) return

  sqlite.exec('BEGIN')
  try {
    sqlite.exec(COPY_FROM_PROCESSES)
    sqlite.exec('DROP TABLE processes')
    sqlite.exec('COMMIT')
  } catch (error) {
    sqlite.exec('ROLLBACK')
    throw error
  }
}
