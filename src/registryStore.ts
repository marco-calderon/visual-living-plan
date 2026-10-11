import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { STALE_MS } from './registryConstants.js'
import { isPidAlive } from './pid.js'
import type { GitSnapshot, ProcessPulse, ProcessRecord } from './processRecord.js'
import { emptyGitSnapshot } from './processRecord.js'

type SqlValue = string | number | null

export type StoredPlanSession = {
  id: string
  token: string
  planPath: string
  mode: 'watch' | 'review'
  iteration: number
  cwd: string
  configPath: string | null
  responsesJson: string
  executionJson: string
  reviewJson: string | null
  startedAt: number
  lastSeenAt: number
}

export type RegistryStore = {
  upsert(record: ProcessRecord): void
  get(id: string): ProcessRecord | undefined
  list(): ProcessRecord[]
  heartbeat(id: string, pulse: ProcessPulse): ProcessRecord | undefined
  remove(id: string): boolean
  prune(options?: { now?: number; staleMs?: number; isAlive?: (pid: number) => boolean }): string[]
  saveSession(session: StoredPlanSession): void
  getSession(id: string): StoredPlanSession | undefined
  getSessionByPath(planPath: string): StoredPlanSession | undefined
  listSessions(): StoredPlanSession[]
  deleteSession(id: string): boolean
  close(): void
}

let sqliteImport: Promise<typeof import('node:sqlite')> | undefined

function loadSqlite(): Promise<typeof import('node:sqlite')> {
  if (!sqliteImport) {
    const emit = process.emitWarning.bind(process)
    process.emitWarning = ((warning: unknown, ...args: unknown[]) => {
      const message =
        typeof warning === 'string' ? warning : warning instanceof Error ? warning.message : ''
      if (message.includes('SQLite is an experimental feature')) return
      return Reflect.apply(emit, process, [warning, ...args])
    }) as typeof process.emitWarning
    sqliteImport = import('node:sqlite')
  }
  return sqliteImport
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  return value
}

function parsePaths(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return []
  }
}

function rowToSession(row: Record<string, unknown>): StoredPlanSession {
  return {
    id: asText(row.id) ?? '',
    token: asText(row.token) ?? '',
    planPath: asText(row.plan_path) ?? '',
    mode: row.mode === 'review' ? 'review' : 'watch',
    iteration: asNumber(row.iteration) || 1,
    cwd: asText(row.cwd) ?? '',
    configPath: asText(row.config_path),
    responsesJson: asText(row.responses_json) ?? '{}',
    executionJson: asText(row.execution_json) ?? '{}',
    reviewJson: asText(row.review_json),
    startedAt: asNumber(row.started_at),
    lastSeenAt: asNumber(row.last_seen_at),
  }
}

function rowToRecord(row: Record<string, unknown>): ProcessRecord {
  const git: GitSnapshot = {
    isRepo: asNumber(row.git_is_repo) === 1,
    root: asText(row.git_root),
    branch: asText(row.git_branch),
    commit: asText(row.git_commit),
    dirty: asNumber(row.git_dirty) === 1,
    ahead: asNumber(row.git_ahead),
    behind: asNumber(row.git_behind),
    changedFiles: asNumber(row.git_changed_files),
    changedPaths: parsePaths(row.git_paths),
    summary: asText(row.git_summary) ?? '',
  }
  return {
    id: asText(row.id) ?? '',
    pid: asNumber(row.pid),
    title: asText(row.title) ?? '',
    summary: asText(row.summary),
    agent: asText(row.agent),
    mode: row.mode === 'review' ? 'review' : 'watch',
    planPath: asText(row.plan_path) ?? '',
    directory: asText(row.directory) ?? '',
    cwd: asText(row.cwd) ?? '',
    url: asText(row.url) ?? '',
    host: asText(row.host) ?? '',
    port: asNumber(row.port),
    startedAt: asNumber(row.started_at),
    heartbeatAt: asNumber(row.heartbeat_at),
    pendingCount: asNumber(row.pending_count),
    executionActive: asNumber(row.execution_active) === 1,
    executionStep: asText(row.execution_step),
    git,
  }
}

function recordValues(record: ProcessRecord): SqlValue[] {
  const git = record.git ?? emptyGitSnapshot()
  return [
    record.id,
    record.pid,
    record.title,
    record.summary,
    record.agent,
    record.mode,
    record.planPath,
    record.directory,
    record.cwd,
    record.url,
    record.host,
    record.port,
    record.startedAt,
    record.heartbeatAt,
    record.pendingCount,
    record.executionActive ? 1 : 0,
    record.executionStep,
    git.isRepo ? 1 : 0,
    git.root,
    git.branch,
    git.commit,
    git.dirty ? 1 : 0,
    git.ahead,
    git.behind,
    git.changedFiles,
    JSON.stringify(git.changedPaths),
    git.summary,
  ]
}

const UPSERT = `
  INSERT INTO processes (
    id, pid, title, summary, agent, mode, plan_path, directory, cwd, url, host, port,
    started_at, heartbeat_at, pending_count, execution_active, execution_step,
    git_is_repo, git_root, git_branch, git_commit, git_dirty, git_ahead, git_behind,
    git_changed_files, git_paths, git_summary
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    pid = excluded.pid,
    title = excluded.title,
    summary = excluded.summary,
    agent = excluded.agent,
    mode = excluded.mode,
    plan_path = excluded.plan_path,
    directory = excluded.directory,
    cwd = excluded.cwd,
    url = excluded.url,
    host = excluded.host,
    port = excluded.port,
    heartbeat_at = excluded.heartbeat_at,
    pending_count = excluded.pending_count,
    execution_active = excluded.execution_active,
    execution_step = excluded.execution_step,
    git_is_repo = excluded.git_is_repo,
    git_root = excluded.git_root,
    git_branch = excluded.git_branch,
    git_commit = excluded.git_commit,
    git_dirty = excluded.git_dirty,
    git_ahead = excluded.git_ahead,
    git_behind = excluded.git_behind,
    git_changed_files = excluded.git_changed_files,
    git_paths = excluded.git_paths,
    git_summary = excluded.git_summary
`

export async function openRegistryStore(dbPath: string): Promise<RegistryStore> {
  if (dbPath !== ':memory:') {
    await mkdir(dirname(dbPath), { recursive: true })
  }
  const { DatabaseSync } = await loadSqlite()
  const database = new DatabaseSync(dbPath)
  if (dbPath !== ':memory:') {
    database.exec('PRAGMA journal_mode = WAL')
  }
  database.exec('PRAGMA busy_timeout = 3000')
  database.exec(`
    CREATE TABLE IF NOT EXISTS plan_sessions (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      plan_path TEXT NOT NULL UNIQUE,
      mode TEXT NOT NULL,
      iteration INTEGER NOT NULL DEFAULT 1,
      cwd TEXT NOT NULL,
      config_path TEXT,
      responses_json TEXT NOT NULL DEFAULT '{}',
      execution_json TEXT NOT NULL DEFAULT '{}',
      review_json TEXT,
      started_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    )
  `)
  database.exec(`
    CREATE TABLE IF NOT EXISTS processes (
      id TEXT PRIMARY KEY,
      pid INTEGER NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      agent TEXT,
      mode TEXT NOT NULL,
      plan_path TEXT NOT NULL,
      directory TEXT NOT NULL,
      cwd TEXT NOT NULL,
      url TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      started_at INTEGER NOT NULL,
      heartbeat_at INTEGER NOT NULL,
      pending_count INTEGER NOT NULL DEFAULT 0,
      execution_active INTEGER NOT NULL DEFAULT 0,
      execution_step TEXT,
      git_is_repo INTEGER NOT NULL DEFAULT 0,
      git_root TEXT,
      git_branch TEXT,
      git_commit TEXT,
      git_dirty INTEGER NOT NULL DEFAULT 0,
      git_ahead INTEGER NOT NULL DEFAULT 0,
      git_behind INTEGER NOT NULL DEFAULT 0,
      git_changed_files INTEGER NOT NULL DEFAULT 0,
      git_paths TEXT NOT NULL DEFAULT '[]',
      git_summary TEXT NOT NULL DEFAULT ''
    )
  `)

  const upsertStatement = database.prepare(UPSERT)
  const getStatement = database.prepare('SELECT * FROM processes WHERE id = ?')
  const listStatement = database.prepare('SELECT * FROM processes ORDER BY started_at DESC')
  const removeStatement = database.prepare('DELETE FROM processes WHERE id = ?')
  const saveSessionStatement = database.prepare(`
    INSERT INTO plan_sessions (
      id, token, plan_path, mode, iteration, cwd, config_path,
      responses_json, execution_json, review_json, started_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      token = excluded.token,
      plan_path = excluded.plan_path,
      mode = excluded.mode,
      iteration = excluded.iteration,
      cwd = excluded.cwd,
      config_path = excluded.config_path,
      responses_json = excluded.responses_json,
      execution_json = excluded.execution_json,
      review_json = excluded.review_json,
      last_seen_at = excluded.last_seen_at
  `)
  const getSessionStatement = database.prepare('SELECT * FROM plan_sessions WHERE id = ?')
  const getSessionByPathStatement = database.prepare('SELECT * FROM plan_sessions WHERE plan_path = ?')
  const listSessionsStatement = database.prepare('SELECT * FROM plan_sessions ORDER BY started_at DESC')
  const deleteSessionStatement = database.prepare('DELETE FROM plan_sessions WHERE id = ?')
  let closed = false

  const store: RegistryStore = {
    upsert(record) {
      upsertStatement.run(...recordValues(record))
    },
    get(id) {
      const row = getStatement.get(id)
      return row ? rowToRecord(row) : undefined
    },
    list() {
      return listStatement.all().map((row) => rowToRecord(row))
    },
    heartbeat(id, pulse) {
      const current = store.get(id)
      if (!current) return undefined
      const next: ProcessRecord = {
        ...current,
        heartbeatAt: pulse.at ?? Date.now(),
        title: pulse.title ?? current.title,
        summary: pulse.summary === undefined ? current.summary : pulse.summary,
        agent: pulse.agent === undefined ? current.agent : pulse.agent,
        pendingCount: pulse.pendingCount ?? current.pendingCount,
        executionActive: pulse.executionActive ?? current.executionActive,
        executionStep: pulse.executionStep === undefined ? current.executionStep : pulse.executionStep,
        git: pulse.git ?? current.git,
      }
      store.upsert(next)
      return store.get(id)
    },
    remove(id) {
      const result = removeStatement.run(id)
      return result.changes > 0
    },
    prune(options) {
      const now = options?.now ?? Date.now()
      const staleMs = options?.staleMs ?? STALE_MS
      const alive = options?.isAlive ?? isPidAlive
      const removed: string[] = []
      for (const record of store.list()) {
        const stale = now - record.heartbeatAt > staleMs
        if (stale || !alive(record.pid)) {
          store.remove(record.id)
          removed.push(record.id)
        }
      }
      return removed
    },
    saveSession(session) {
      saveSessionStatement.run(
        session.id,
        session.token,
        session.planPath,
        session.mode,
        session.iteration,
        session.cwd,
        session.configPath,
        session.responsesJson,
        session.executionJson,
        session.reviewJson,
        session.startedAt,
        session.lastSeenAt,
      )
    },
    getSession(id) {
      const row = getSessionStatement.get(id)
      return row ? rowToSession(row) : undefined
    },
    getSessionByPath(planPath) {
      const row = getSessionByPathStatement.get(planPath)
      return row ? rowToSession(row) : undefined
    },
    listSessions() {
      return listSessionsStatement.all().map((row) => rowToSession(row))
    },
    deleteSession(id) {
      const result = deleteSessionStatement.run(id)
      return result.changes > 0
    },
    close() {
      if (closed) return
      closed = true
      database.close()
    },
  }

  return store
}
