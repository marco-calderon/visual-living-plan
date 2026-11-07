/** How many published plan documents a host keeps for one plan. */
export const PLAN_VERSION_LIMIT = 10

/** Latest saved document for each plan. A missing table is created before this runs. */
export const LATEST_PLAN_VERSION_SQL = `SELECT p.id, p.title, p.mode, p.ended_at, p.started_at, p.meta,
       v.seq AS version_seq, v.title AS version_title, v.created_at AS version_at
FROM plans p
LEFT JOIN (
  SELECT plan_id, MAX(seq) AS seq
  FROM plan_versions
  GROUP BY plan_id
) latest ON latest.plan_id = p.id
LEFT JOIN plan_versions v ON v.plan_id = latest.plan_id AND v.seq = latest.seq
WHERE p.user_id = ?
ORDER BY p.started_at DESC`

const PLAN_VERSIONS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS plan_versions (
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

const PLAN_VERSIONS_INDEX_SQL = `CREATE INDEX IF NOT EXISTS plan_versions_plan ON plan_versions (plan_id, seq)`

export type VersionStore = Pick<D1Database, 'prepare'>

/** Create the versions table when this host was deployed before that migration. */
export async function ensurePlanVersions(db: VersionStore): Promise<void> {
  await db.prepare(PLAN_VERSIONS_TABLE_SQL).run()
  await db.prepare(PLAN_VERSIONS_INDEX_SQL).run()
}

export type PublishedVersion = {
  seq: number
  title: string
  source: string
  createdAt: number
  stored: boolean
}

type VersionRow = {
  seq: number
  title: string
  body: string
  created_at: number
}

/** Store a published plan document. The same title and source do not take another slot. An 11th version drops the oldest. */
export async function publishPlanVersion(
  db: VersionStore,
  input: { planId: string; userId: string; title: string; source: string; now?: number },
): Promise<PublishedVersion> {
  await ensurePlanVersions(db)
  const title = versionTitle(input.title)
  const source = input.source
  const latest = await db
    .prepare('SELECT seq, title, body, created_at FROM plan_versions WHERE plan_id = ? ORDER BY seq DESC LIMIT 1')
    .bind(input.planId)
    .first<VersionRow>()
  if (latest && latest.body === source && latest.title === title) {
    return { seq: latest.seq, title: latest.title, source: latest.body, createdAt: latest.created_at, stored: false }
  }
  const seq = (latest?.seq ?? 0) + 1
  const id = crypto.randomUUID()
  const createdAt = input.now ?? Date.now()
  await db
    .prepare(
      'INSERT INTO plan_versions (id, plan_id, seq, title, body, created_at, parent_id, reason, restored_from_id) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL)',
    )
    .bind(id, input.planId, seq, title, source, createdAt)
    .run()
  await db
    .prepare(
      `DELETE FROM plan_versions
       WHERE plan_id = ?
         AND seq < (
           SELECT MIN(seq) FROM (
             SELECT seq FROM plan_versions WHERE plan_id = ? ORDER BY seq DESC LIMIT ${PLAN_VERSION_LIMIT}
           )
         )`,
    )
    .bind(input.planId, input.planId)
    .run()
  return { seq, title, source, createdAt, stored: true }
}

/** Bytes one version takes: its title and body in UTF-8, the same as account usage counts. */
export function versionBytes(title: string, source: string): number {
  const encoder = new TextEncoder()
  return encoder.encode(versionTitle(title)).length + encoder.encode(source).length
}

function versionTitle(title: string): string {
  return title.slice(0, 200) || 'Living plan'
}

/**
 * The account's stored bytes now, and after this publish. An unchanged document adds nothing, and
 * a plan at its version limit drops its oldest version, so that version's bytes come off.
 */
export async function storageAfterPublish(
  db: VersionStore,
  input: { planId: string; userId: string; title: string; source: string },
): Promise<{ used: number; after: number }> {
  await ensurePlanVersions(db)
  const totals = await db
    .prepare(
      `SELECT COALESCE(SUM(LENGTH(CAST(v.body AS BLOB)) + LENGTH(CAST(v.title AS BLOB))), 0) AS bytes
       FROM plan_versions v JOIN plans p ON p.id = v.plan_id WHERE p.user_id = ?`,
    )
    .bind(input.userId)
    .first<{ bytes: number }>()
  const used = Number(totals?.bytes ?? 0)
  const title = versionTitle(input.title)
  const latest = await db
    .prepare('SELECT title, body FROM plan_versions WHERE plan_id = ? ORDER BY seq DESC LIMIT 1')
    .bind(input.planId)
    .first<{ title: string; body: string }>()
  if (latest && latest.body === input.source && latest.title === title) return { used, after: used }
  const dropped = await db
    .prepare(
      `SELECT COALESCE(SUM(LENGTH(CAST(body AS BLOB)) + LENGTH(CAST(title AS BLOB))), 0) AS bytes FROM (
         SELECT body, title FROM plan_versions WHERE plan_id = ? ORDER BY seq ASC
         LIMIT MAX(0, (SELECT COUNT(*) FROM plan_versions WHERE plan_id = ?) + 1 - ${PLAN_VERSION_LIMIT})
       )`,
    )
    .bind(input.planId, input.planId)
    .first<{ bytes: number }>()
  return { used, after: used - Number(dropped?.bytes ?? 0) + versionBytes(title, input.source) }
}

export async function listPlanVersions(
  db: VersionStore,
  planId: string,
): Promise<Array<{ seq: number; title: string; createdAt: number }>> {
  await ensurePlanVersions(db)
  const listed = await db
    .prepare('SELECT seq, title, created_at FROM plan_versions WHERE plan_id = ? ORDER BY seq DESC LIMIT ?')
    .bind(planId, PLAN_VERSION_LIMIT)
    .all<{ seq: number; title: string; created_at: number }>()
  return (listed.results ?? []).map((row) => ({ seq: row.seq, title: row.title, createdAt: row.created_at }))
}

export async function readPlanVersion(
  db: VersionStore,
  planId: string,
  seq: number | 'latest',
): Promise<{ seq: number; title: string; source: string; createdAt: number } | null> {
  await ensurePlanVersions(db)
  const row =
    seq === 'latest'
      ? await db
          .prepare('SELECT seq, title, body, created_at FROM plan_versions WHERE plan_id = ? ORDER BY seq DESC LIMIT 1')
          .bind(planId)
          .first<VersionRow>()
      : await db
          .prepare('SELECT seq, title, body, created_at FROM plan_versions WHERE plan_id = ? AND seq = ?')
          .bind(planId, seq)
          .first<VersionRow>()
  if (!row) return null
  return { seq: row.seq, title: row.title, source: row.body, createdAt: row.created_at }
}

/** Every saved document for a plan, newest first. At most the latest 10 exist. */
export async function readPlanVersions(
  db: VersionStore,
  planId: string,
): Promise<Array<{ seq: number; title: string; source: string; createdAt: number }>> {
  await ensurePlanVersions(db)
  const listed = await db
    .prepare('SELECT seq, title, body, created_at FROM plan_versions WHERE plan_id = ? ORDER BY seq DESC LIMIT ?')
    .bind(planId, PLAN_VERSION_LIMIT)
    .all<VersionRow>()
  return (listed.results ?? []).map((row) => ({ seq: row.seq, title: row.title, source: row.body, createdAt: row.created_at }))
}
