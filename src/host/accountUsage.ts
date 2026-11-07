import { PLAN_CAPS, normalizeTier, type Tier } from './access'
import { hostedAgentPresence } from './hostedDashboard'
import { PLAN_VERSION_LIMIT } from './planVersions'

export type UsagePlan = {
  id: string
  title: string
  status: string
  versions: number
  bytes: number
}

export type AccountUsage = {
  tier: Tier
  /** Plans with an agent listening now, and how many this tier allows at once. */
  activePlans: number
  activeCap: number
  /** Saved versions kept per plan. Older versions are deleted. */
  versionLimit: number
  plans: number
  versions: number
  bytes: number
  /** Largest first. */
  byPlan: UsagePlan[]
}

type UsageRow = {
  id: string
  title: string | null
  status: string
  versions: number | null
  bytes: number | null
  meta?: string | null
}

// LENGTH on a BLOB counts bytes. On TEXT it counts characters.
const USAGE_SQL = `SELECT p.id, p.title, p.status, p.meta,
  COUNT(v.id) AS versions,
  COALESCE(SUM(LENGTH(CAST(v.body AS BLOB)) + LENGTH(CAST(v.title AS BLOB))), 0) AS bytes
FROM plans p
LEFT JOIN plan_versions v ON v.plan_id = p.id
WHERE p.user_id = ?
GROUP BY p.id
ORDER BY bytes DESC, p.started_at DESC`

/** What one account stores on this host: saved plan versions, grouped by plan. */
export async function readAccountUsage(db: D1Database, userId: string, tierValue: unknown): Promise<AccountUsage> {
  const tier = normalizeTier(tierValue)
  const listed = await db.prepare(USAGE_SQL).bind(userId).all<UsageRow>()
  return accountUsage(tier, listed.results ?? [])
}

export function accountUsage(tier: Tier, rows: UsageRow[], now = Date.now()): AccountUsage {
  const listening = rows.filter((row) => row.status === 'running' && hostedAgentPresence(row.meta, now).agentConnected).length
  const byPlan = rows.map((row) => ({
    id: row.id,
    title: row.title?.trim() || 'Living plan',
    status: row.status,
    versions: Number(row.versions ?? 0),
    bytes: Number(row.bytes ?? 0),
  }))
  return {
    tier,
    activePlans: listening,
    activeCap: PLAN_CAPS[tier],
    versionLimit: PLAN_VERSION_LIMIT,
    plans: byPlan.length,
    versions: byPlan.reduce((sum, plan) => sum + plan.versions, 0),
    bytes: byPlan.reduce((sum, plan) => sum + plan.bytes, 0),
    byPlan,
  }
}
