/** How many published plan documents a host keeps for one plan. */
export const PLAN_VERSION_LIMIT = 10

/** Latest saved document for each plan. A missing table is created before this runs. */
export const LATEST_PLAN_VERSION_SQL = `SELECT p.id, p.title, p.mode, p.closed_at, p.created_at,
       v.seq AS version_seq, v.title AS version_title, v.created_at AS version_at
FROM plans p
LEFT JOIN (
  SELECT plan_id, MAX(seq) AS seq
  FROM plan_versions
  GROUP BY plan_id
) latest ON latest.plan_id = p.id
LEFT JOIN plan_versions v ON v.plan_id = latest.plan_id AND v.seq = latest.seq
WHERE p.user_id = ?
ORDER BY p.created_at DESC`

const PLAN_VERSIONS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS plan_versions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
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
  source: string
  created_at: number
}

/** Store a published plan document. The same title and source do not take another slot. An 11th version drops the oldest. */
export async function publishPlanVersion(
  db: VersionStore,
  input: { planId: string; userId: string; title: string; source: string; now?: number },
): Promise<PublishedVersion> {
  await ensurePlanVersions(db)
  const title = input.title.slice(0, 200) || 'Living plan'
  const source = input.source
  const latest = await db
    .prepare('SELECT seq, title, source, created_at FROM plan_versions WHERE plan_id = ? ORDER BY seq DESC LIMIT 1')
    .bind(input.planId)
    .first<VersionRow>()
  if (latest && latest.source === source && latest.title === title) {
    return { seq: latest.seq, title: latest.title, source: latest.source, createdAt: latest.created_at, stored: false }
  }
  const seq = (latest?.seq ?? 0) + 1
  const id = crypto.randomUUID()
  const createdAt = input.now ?? Date.now()
  await db
    .prepare(
      'INSERT INTO plan_versions (id, plan_id, user_id, seq, title, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(id, input.planId, input.userId, seq, title, source, createdAt)
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
          .prepare('SELECT seq, title, source, created_at FROM plan_versions WHERE plan_id = ? ORDER BY seq DESC LIMIT 1')
          .bind(planId)
          .first<VersionRow>()
      : await db
          .prepare('SELECT seq, title, source, created_at FROM plan_versions WHERE plan_id = ? AND seq = ?')
          .bind(planId, seq)
          .first<VersionRow>()
  if (!row) return null
  return { seq: row.seq, title: row.title, source: row.source, createdAt: row.created_at }
}
