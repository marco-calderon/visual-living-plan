/** How many published plan documents a host keeps for one plan. */
export const PLAN_VERSION_LIMIT = 10

export type VersionStore = Pick<D1Database, 'prepare'>

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
