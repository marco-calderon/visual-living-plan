import { parseStoredRun } from './rows'
import { emptyMeta, type PlanMeta } from './meta'
import { emptyGitSnapshot, isPlanMode, type PlanStatus } from '../processRecord'
import type { SqliteStore } from './sqlite'

const PLAN_SQL = `CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  token TEXT,
  title TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  plan_path TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  heartbeat_at INTEGER NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}'
)`

const RUN_SQL = `CREATE TABLE plan_runs (
  run_id TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  user_id TEXT,
  token TEXT,
  title TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  plan_path TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  heartbeat_at INTEGER NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}'
)`

const VERSION_SQL = `CREATE TABLE plan_versions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  parent_id TEXT,
  reason TEXT,
  restored_from_id TEXT,
  UNIQUE (plan_id, seq)
)`

const EVENT_SQL = `CREATE TABLE plan_events (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  event TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  delivered_at INTEGER
)`

const SETTINGS_SQL = `CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY,
  meta TEXT NOT NULL
)`

/** Better Auth tables. Present locally and on D1. Sign-in runs only on the host. */
const AUTH_SQL = `
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free'
);
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expiresAt TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  activeOrganizationId TEXT
);
CREATE INDEX IF NOT EXISTS session_userId ON session (userId);
CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt TEXT,
  refreshTokenExpiresAt TEXT,
  scope TEXT,
  password TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS account_userId ON account (userId);
CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS verification_identifier ON verification (identifier);
CREATE TABLE IF NOT EXISTS organization (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo TEXT,
  createdAt TEXT NOT NULL,
  metadata TEXT
);
CREATE TABLE IF NOT EXISTS member (
  id TEXT PRIMARY KEY,
  organizationId TEXT NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS member_organizationId ON member (organizationId);
CREATE INDEX IF NOT EXISTS member_userId ON member (userId);
CREATE TABLE IF NOT EXISTS invitation (
  id TEXT PRIMARY KEY,
  organizationId TEXT NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  inviterId TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS invitation_organizationId ON invitation (organizationId);
`

function tableExists(db: SqliteStore, name: string): boolean {
  return Boolean(
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).bind(name).get<{ name: string }>(),
  )
}

function columnNames(db: SqliteStore, table: string): Set<string> {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>().map((row) => row.name))
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function bit(value: unknown): boolean {
  return value === 1 || value === true
}

function jsonValue(value: unknown, fallback: unknown): unknown {
  if (typeof value !== 'string' || !value) return fallback
  try {
    return JSON.parse(value) as unknown
  } catch {
    return fallback
  }
}

function stringList(value: unknown): string[] {
  const parsed = typeof value === 'string' ? jsonValue(value, []) : value
  return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
}

function metaFromWide(row: Record<string, unknown>, session?: Record<string, unknown>): PlanMeta {
  const git = emptyGitSnapshot()
  git.isRepo = bit(row.git_is_repo)
  git.root = text(row.git_root)
  git.branch = text(row.git_branch)
  git.commit = text(row.git_commit)
  git.dirty = bit(row.git_dirty)
  git.ahead = num(row.git_ahead)
  git.behind = num(row.git_behind)
  git.changedFiles = num(row.git_changed_files)
  git.changedPaths = stringList(row.git_paths)
  git.summary = text(row.git_summary) ?? ''
  return emptyMeta({
    pid: typeof row.pid === 'number' ? row.pid : null,
    summary: text(row.summary),
    agent: text(row.agent),
    storedPath: text(row.stored_path),
    directory: text(row.directory) ?? '',
    cwd: text(session?.cwd) ?? text(row.cwd) ?? '',
    url: text(row.url) ?? '',
    host: text(row.host) ?? '',
    port: num(row.port),
    durationMs: num(row.duration_ms),
    pendingCount: num(row.pending_count),
    phaseTotal: num(row.phase_total),
    phaseDone: num(row.phase_done),
    interactionTotal: num(row.interaction_total),
    interactionDone: num(row.interaction_done),
    completionRatio: num(row.completion_ratio),
    completionState:
      row.completion_state === 'in_progress' || row.completion_state === 'partial' || row.completion_state === 'complete'
        ? row.completion_state
        : 'idle',
    executionActive: bit(row.execution_active),
    executionStep: text(row.execution_step),
    filesModified: num(row.files_modified),
    outcome: row.outcome === 'approve' || row.outcome === 'deny' || row.outcome === 'iterate' ? row.outcome : null,
    git,
    iteration: session ? num(session.iteration, 1) : 1,
    configPath: session ? text(session.config_path) : null,
    responses: session ? jsonValue(session.responses_json, {}) : {},
    execution: session ? jsonValue(session.execution_json, {}) : {},
    review: session ? jsonValue(session.review_json, null) : null,
    comments: session ? jsonValue(session.comments_json, []) : [],
    lastSeenAt: session ? num(session.last_seen_at) : null,
  })
}

function statusOf(value: unknown): PlanStatus {
  return value === 'executed' || value === 'interrupted' ? value : 'running'
}

function insertPlan(db: SqliteStore, row: Record<string, unknown>, session?: Record<string, unknown>): void {
  const mode = text(session?.mode) ?? text(row.mode) ?? 'watch'
  db.prepare(
    `INSERT INTO plans (id, user_id, token, title, mode, status, plan_path, started_at, ended_at, heartbeat_at, meta)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    text(row.id) ?? text(session?.id),
    session ? text(session.token) : null,
    text(row.title) ?? '',
    isPlanMode(mode) ? mode : 'watch',
    statusOf(row.status),
    text(row.plan_path) ?? text(session?.plan_path),
    num(row.started_at ?? session?.started_at),
    typeof row.ended_at === 'number' ? row.ended_at : null,
    num(row.heartbeat_at ?? session?.last_seen_at ?? row.started_at),
    JSON.stringify(metaFromWide(row, session)),
  )
}

function insertRun(db: SqliteStore, row: Record<string, unknown>): void {
  const mode = text(row.mode) ?? 'watch'
  db.prepare(
    `INSERT INTO plan_runs (run_id, id, user_id, token, title, mode, status, plan_path, started_at, ended_at, heartbeat_at, meta)
     VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    text(row.run_id),
    text(row.id),
    text(row.title) ?? '',
    isPlanMode(mode) ? mode : 'watch',
    statusOf(row.status),
    text(row.plan_path),
    num(row.started_at),
    typeof row.ended_at === 'number' ? row.ended_at : null,
    num(row.heartbeat_at ?? row.started_at),
    JSON.stringify(metaFromWide(row)),
  )
}

function createFresh(db: SqliteStore): void {
  db.exec(PLAN_SQL)
  db.exec(RUN_SQL)
  db.exec(VERSION_SQL)
  db.exec(EVENT_SQL)
  db.exec(SETTINGS_SQL)
}

function createIndexes(db: SqliteStore): void {
  db.exec('CREATE INDEX IF NOT EXISTS plans_plan_path_idx ON plans (plan_path)')
  db.exec('CREATE INDEX IF NOT EXISTS plans_started_at_idx ON plans (started_at)')
  db.exec('CREATE INDEX IF NOT EXISTS plans_status_idx ON plans (status)')
  db.exec('CREATE INDEX IF NOT EXISTS plans_user_idx ON plans (user_id)')
  db.exec('CREATE INDEX IF NOT EXISTS plan_runs_started_at_idx ON plan_runs (started_at)')
  db.exec('CREATE INDEX IF NOT EXISTS plan_runs_ended_at_idx ON plan_runs (ended_at)')
  db.exec('CREATE INDEX IF NOT EXISTS plan_events_plan_id_idx ON plan_events (plan_id)')
  db.exec('CREATE INDEX IF NOT EXISTS plan_events_plan_seq_idx ON plan_events (plan_id, seq)')
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS plan_versions_plan_seq ON plan_versions (plan_id, seq)')
  db.exec('CREATE INDEX IF NOT EXISTS plan_versions_plan ON plan_versions (plan_id, seq)')
}

function foldLegacy(db: SqliteStore): void {
  const processes = tableExists(db, 'processes') ? db.prepare('SELECT * FROM processes').all<Record<string, unknown>>() : []
  const widePlans =
    tableExists(db, 'plans') && columnNames(db, 'plans').has('pid')
      ? db.prepare('SELECT * FROM plans').all<Record<string, unknown>>()
      : []
  const sessions = tableExists(db, 'plan_sessions') ? db.prepare('SELECT * FROM plan_sessions').all<Record<string, unknown>>() : []
  const sessionById = new Map(sessions.map((row) => [String(row.id), row]))
  const runColumns = tableExists(db, 'plan_runs') ? columnNames(db, 'plan_runs') : new Set<string>()
  const wideRuns =
    runColumns.has('title') && runColumns.has('pid') ? db.prepare('SELECT * FROM plan_runs').all<Record<string, unknown>>() : []
  const payloadRuns =
    runColumns.has('payload') && !runColumns.has('meta')
      ? db.prepare('SELECT run_id, started_at, payload FROM plan_runs').all<{ run_id: string; started_at: number; payload: string }>()
      : []
  const eventColumns = tableExists(db, 'plan_events') ? columnNames(db, 'plan_events') : new Set<string>()
  const events =
    eventColumns.has('data_json') && !eventColumns.has('data')
      ? db.prepare('SELECT * FROM plan_events').all<Record<string, unknown>>()
      : eventColumns.has('data')
        ? db.prepare('SELECT * FROM plan_events').all<Record<string, unknown>>()
        : []
  const snapshots = tableExists(db, 'plan_snapshots') ? db.prepare('SELECT * FROM plan_snapshots').all<Record<string, unknown>>() : []
  const versionColumns = tableExists(db, 'plan_versions') ? columnNames(db, 'plan_versions') : new Set<string>()
  const oldVersions = versionColumns.has('source') ? db.prepare('SELECT * FROM plan_versions').all<Record<string, unknown>>() : []
  const currentVersions =
    versionColumns.has('body') && !versionColumns.has('source')
      ? db.prepare('SELECT * FROM plan_versions').all<Record<string, unknown>>()
      : []
  const currentPlans =
    tableExists(db, 'plans') && columnNames(db, 'plans').has('meta') && !columnNames(db, 'plans').has('pid')
      ? db.prepare('SELECT * FROM plans').all<Record<string, unknown>>()
      : []
  const currentRuns =
    runColumns.has('meta') && !runColumns.has('pid') ? db.prepare('SELECT * FROM plan_runs').all<Record<string, unknown>>() : []

  const drop = [
    'processes',
    'plans',
    'plan_sessions',
    'plan_runs',
    'plan_events',
    'plan_documents',
    'plan_snapshots',
    'plan_versions',
  ]
  db.transaction(() => {
    for (const name of drop) {
      if (tableExists(db, name)) db.exec(`DROP TABLE ${name}`)
    }
    createFresh(db)
    const seen = new Set<string>()
    for (const row of currentPlans) {
      db.prepare(
        `INSERT INTO plans (id, user_id, token, title, mode, status, plan_path, started_at, ended_at, heartbeat_at, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        text(row.id),
        text(row.user_id),
        text(row.token),
        text(row.title) ?? '',
        text(row.mode) ?? 'watch',
        statusOf(row.status),
        text(row.plan_path),
        num(row.started_at),
        typeof row.ended_at === 'number' ? row.ended_at : null,
        num(row.heartbeat_at),
        typeof row.meta === 'string' ? row.meta : JSON.stringify(row.meta ?? {}),
      )
      seen.add(String(row.id))
    }
    for (const row of [...widePlans, ...processes]) {
      const id = String(row.id)
      if (seen.has(id)) continue
      seen.add(id)
      const session = sessionById.get(id)
      insertPlan(db, row, session)
      if (session) sessionById.delete(id)
    }
    for (const session of sessionById.values()) {
      insertPlan(db, { id: session.id, title: '', mode: session.mode, status: 'running', plan_path: session.plan_path, started_at: session.started_at, heartbeat_at: session.last_seen_at }, session)
    }
    for (const row of currentRuns) {
      db.prepare(
        `INSERT INTO plan_runs (run_id, id, user_id, token, title, mode, status, plan_path, started_at, ended_at, heartbeat_at, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        text(row.run_id),
        text(row.id),
        text(row.user_id),
        text(row.token),
        text(row.title) ?? '',
        text(row.mode) ?? 'watch',
        statusOf(row.status),
        text(row.plan_path),
        num(row.started_at),
        typeof row.ended_at === 'number' ? row.ended_at : null,
        num(row.heartbeat_at),
        typeof row.meta === 'string' ? row.meta : JSON.stringify(row.meta ?? {}),
      )
    }
    for (const row of wideRuns) insertRun(db, row)
    for (const row of payloadRuns) {
      const record = parseStoredRun(row.payload)
      if (!record) continue
      insertRun(db, {
        run_id: row.run_id,
        id: record.id,
        title: record.title,
        mode: record.mode,
        status: record.status,
        plan_path: record.planPath,
        started_at: record.startedAt,
        ended_at: record.endedAt,
        heartbeat_at: record.heartbeatAt,
        pid: record.pid,
        summary: record.summary,
        agent: record.agent,
        stored_path: record.storedPath,
        directory: record.directory,
        cwd: record.cwd,
        url: record.url,
        host: record.host,
        port: record.port,
        duration_ms: record.durationMs,
        pending_count: record.pendingCount,
        phase_total: record.phaseTotal,
        phase_done: record.phaseDone,
        interaction_total: record.interactionTotal,
        interaction_done: record.interactionDone,
        completion_ratio: record.completionRatio,
        completion_state: record.completionState,
        execution_active: record.executionActive ? 1 : 0,
        execution_step: record.executionStep,
        files_modified: record.filesModified,
        outcome: record.outcome,
        git_is_repo: record.git.isRepo ? 1 : 0,
        git_root: record.git.root,
        git_branch: record.git.branch,
        git_commit: record.git.commit,
        git_dirty: record.git.dirty ? 1 : 0,
        git_ahead: record.git.ahead,
        git_behind: record.git.behind,
        git_changed_files: record.git.changedFiles,
        git_paths: JSON.stringify(record.git.changedPaths),
        git_summary: record.git.summary,
      })
    }
    for (const row of events) {
      db.prepare(
        `INSERT INTO plan_events (id, plan_id, seq, event, data, created_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        text(row.id),
        text(row.plan_id),
        num(row.seq),
        text(row.event) ?? '',
        text(row.data) ?? text(row.data_json) ?? '{}',
        num(row.created_at),
        typeof row.delivered_at === 'number' ? row.delivered_at : null,
      )
    }
    for (const row of snapshots) {
      db.prepare(
        `INSERT INTO plan_versions (id, plan_id, seq, title, body, created_at, parent_id, reason, restored_from_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        text(row.id),
        text(row.document_id),
        num(row.seq),
        text(row.title) ?? '',
        text(row.body) ?? '',
        num(row.created_at),
        text(row.parent_id),
        text(row.reason),
        text(row.restored_from_id),
      )
    }
    for (const row of currentVersions) {
      db.prepare(
        `INSERT OR IGNORE INTO plan_versions (id, plan_id, seq, title, body, created_at, parent_id, reason, restored_from_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        text(row.id),
        text(row.plan_id),
        num(row.seq),
        text(row.title) ?? '',
        text(row.body) ?? '',
        num(row.created_at),
        text(row.parent_id),
        text(row.reason),
        text(row.restored_from_id),
      )
    }
    for (const row of oldVersions) {
      db.prepare(
        `INSERT OR IGNORE INTO plan_versions (id, plan_id, seq, title, body, created_at, parent_id, reason, restored_from_id)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
      ).run(text(row.id), text(row.plan_id), num(row.seq), text(row.title) ?? '', text(row.source) ?? '', num(row.created_at))
    }
  })
}

function needsFold(db: SqliteStore): boolean {
  if (tableExists(db, 'processes') || tableExists(db, 'plan_sessions') || tableExists(db, 'plan_documents') || tableExists(db, 'plan_snapshots')) {
    return true
  }
  if (tableExists(db, 'plans') && columnNames(db, 'plans').has('pid')) return true
  if (tableExists(db, 'plan_runs')) {
    const columns = columnNames(db, 'plan_runs')
    if (columns.has('payload') || columns.has('pid')) return true
  }
  if (tableExists(db, 'plan_events') && columnNames(db, 'plan_events').has('data_json') && !columnNames(db, 'plan_events').has('data')) {
    return true
  }
  if (tableExists(db, 'plan_versions') && columnNames(db, 'plan_versions').has('source')) return true
  return false
}

/** Create the shared tables, and fold an older local registry into them. */
export function migratePlanDatabase(db: SqliteStore): void {
  if (needsFold(db)) foldLegacy(db)
  if (!tableExists(db, 'plans')) createFresh(db)
  if (!tableExists(db, 'plan_runs')) db.exec(RUN_SQL)
  if (!tableExists(db, 'plan_versions')) db.exec(VERSION_SQL)
  if (!tableExists(db, 'plan_events')) db.exec(EVENT_SQL)
  if (!tableExists(db, 'user_settings')) db.exec(SETTINGS_SQL)
  db.exec(AUTH_SQL)
  createIndexes(db)
}
