import type { SearchDocument } from '../planSearch'
import { actorAllows, planHosted, planIdOf, planView, touchPlan, type PlanSql } from './planRoom'
import { readPlanVersions, type VersionStore } from './planVersions'

/**
 * GET /api/search on a hosted plan. The live plan is searched by default. Saved versions,
 * read from D1, are searched only when `version` asks for them.
 */
export async function hostedSearch(input: {
  sql: PlanSql
  db: VersionStore | undefined
  actor: string | null
  authorization: string | null
  url: URL
}): Promise<Response> {
  const { sql, actor, authorization } = input
  if (!actorAllows(actor, authorization, sql, 'search')) return text(401, 'Sign in required')
  if (!planHosted(sql)) return text(404, 'Plan not found on this host.')
  touchPlan(sql)
  // Loaded on first use. A top-level import of the parser stops the Worker from starting.
  const { SearchRequestError, searchParams, searchPlanDocuments } = await import('../planSearch')
  let params: ReturnType<typeof searchParams>
  try {
    params = searchParams(input.url)
  } catch (error) {
    if (error instanceof SearchRequestError) return text(error.status, error.message)
    throw error
  }
  const planId = planIdOf(sql) ?? ''
  let saved: SearchDocument[] = []
  if (params.version !== 'live') {
    if (!actorAllows(actor, authorization, sql, 'versions')) return text(403, 'Only the plan owner can search saved versions.')
    if (!input.db || !planId) return text(404, 'This plan has no saved versions.')
    saved = await readPlanVersions(input.db, planId)
    if (typeof params.version === 'number' && !saved.some((row) => row.seq === params.version)) {
      return text(404, 'This version is no longer saved. The host keeps the latest 10.')
    }
  }
  const view = planView(sql)
  return Response.json(
    searchPlanDocuments({
      planId,
      ...params,
      live: { seq: 'live', title: view.title, source: view.source, createdAt: null },
      saved,
    }),
  )
}

function text(status: number, message: string): Response {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
