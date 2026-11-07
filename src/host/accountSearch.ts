import type { DashboardSearchResponse } from '../planSearch'
import { hostedDeleted } from './hostedDashboard'
import { ensurePlanVersions, type VersionStore } from './planVersions'

type PlanRow = { id: string; title: string | null; ended_at: number | null; meta: string | null }
type VersionRow = { plan_id: string; seq: number; title: string; body: string; created_at: number }

/**
 * GET /api/account/search: search the plans on this account's dashboard. Each plan's newest
 * saved document is its live text. Older versions are read only with `version=all`.
 */
export async function accountSearch(db: VersionStore, userId: string, url: URL): Promise<Response> {
  // Loaded on first use. A top-level import of the parser stops the Worker from starting.
  const { DASHBOARD_PLAN_LIMIT, SearchRequestError, dashboardSearchParams, searchPlans } = await import('../planSearch')
  let params: ReturnType<typeof dashboardSearchParams>
  try {
    params = dashboardSearchParams(url)
  } catch (error) {
    if (error instanceof SearchRequestError) return text(error.status, error.message)
    throw error
  }
  await ensurePlanVersions(db)
  const listed = await db
    .prepare('SELECT id, title, ended_at, meta FROM plans WHERE user_id = ? ORDER BY started_at DESC')
    .bind(userId)
    .all<PlanRow>()
  const plans = (listed.results ?? []).filter((row) => !hostedDeleted(row.meta))
  const searched = plans.slice(0, DASHBOARD_PLAN_LIMIT)
  const documents = new Map<string, Array<{ seq: number; title: string; source: string; createdAt: number }>>()
  if (searched.length > 0) {
    const ids = searched.map(() => '?').join(', ')
    // The host keeps at most 10 versions per plan, so `all` reads at most 10 rows each.
    const latestOnly =
      params.version === 'live' ? ' AND v.seq = (SELECT MAX(seq) FROM plan_versions WHERE plan_id = v.plan_id)' : ''
    const rows = await db
      .prepare(`SELECT v.plan_id, v.seq, v.title, v.body, v.created_at FROM plan_versions v WHERE v.plan_id IN (${ids})${latestOnly}`)
      .bind(...searched.map((row) => row.id))
      .all<VersionRow>()
    for (const row of rows.results ?? []) {
      const list = documents.get(row.plan_id) ?? []
      list.push({ seq: row.seq, title: row.title, source: row.body, createdAt: row.created_at })
      documents.set(row.plan_id, list)
    }
  }
  const result: DashboardSearchResponse = searchPlans({
    ...params,
    plans: plans.map((row) => ({
      planId: row.id,
      title: row.title || 'Living plan',
      // The dashboard opens a plan's page while it runs. A finished plan opens its saved version.
      url: row.ended_at == null ? `/plans/${row.id}/` : null,
      versionUrl: (seq: number) => `/plans/${row.id}/versions/${seq}`,
      documents: documents.get(row.id) ?? [],
    })),
  })
  return Response.json(result, { headers: { 'cache-control': 'no-store' } })
}

function text(status: number, message: string): Response {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
