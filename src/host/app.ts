import { Elysia } from 'elysia'
import type { ProgressFields } from '../processRecord'
import { PLAN_CAPS, allows, normalizeTier, planCapReached } from './access'
import { defaultAccountSettings, readAccountSettings, saveAccountSettings } from './accountSettings'
import { readAccountUsage } from './accountUsage'
import { createAuth, sessionFromToken, type AuthSession } from './auth'
import { listLinkedAccounts } from './linkedAccounts'
import { NO_PROGRESS, hostedDashboard, hostedProgress, saveHostedProgress, type HostedPlanRow } from './hostedDashboard'
import { LATEST_PLAN_VERSION_SQL, ensurePlanVersions, listPlanVersions, publishPlanVersion, readPlanVersion } from './planVersions'
import { rehydrateRequest } from './rehydrateRequest'
import { requestOrigin } from './requestOrigin'

type PlanStub = {
  fetch(request: Request): Promise<Response>
}

type PlanNamespace = {
  idFromName(name: string): unknown
  get(id: unknown): PlanStub
}

export interface HostEnv {
  DB: D1Database
  PLANS: PlanNamespace
  ASSETS?: { fetch(request: Request): Promise<Response> }
  BETTER_AUTH_SECRET: string
  PUBLIC_URL?: string
  TRUSTED_ORIGINS?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  OAUTH_PROXY_SECRET?: string
}

const ID = /^[A-Za-z0-9_-]{8,80}$/

function originFor(request: Request, env: HostEnv): string {
  return requestOrigin(request, env.PUBLIC_URL, env.TRUSTED_ORIGINS)
}

function createAuthFor(env: HostEnv, request: Request) {
  return createAuth(env, originFor(request, env))
}

/** HTTP routes for the hosted app. WebSocket upgrades stay outside this app so the Durable Object socket is not copied into a new Response. Ahead-of-time compilation is off because Workers reject `new Function`. */
export function createHostApp(env: HostEnv, options: { auth?: (request: Request) => ReturnType<typeof createAuth> } = {}) {
  const authFor = options.auth ?? ((request: Request) => createAuthFor(env, request))
  return new Elysia({ strictPath: true, aot: false })
    .onBeforeHandle((context) => {
      rehydrateRequest(context)
    })
    .onError(({ code, error }) => {
      if (code === 'NOT_FOUND') return text(404, 'Not found')
      return text(500, error instanceof Error ? error.message : 'Unknown error')
    })
    .get('/api/health', () => ({ ok: true }))
    .get('/api/account', ({ request }) => accountRead(request, env, authFor(request)))
    .get('/api/account/settings', ({ request }) => accountSettingsRead(request, env, authFor(request)))
    .put('/api/account/settings', ({ request }) => accountSave(request, env, authFor(request)))
    .get('/api/account/usage', ({ request }) => accountUsageApi(request, env, authFor(request)))
    .get('/api/account/dashboard', ({ request }) =>
      accountDashboardApi(request, env, authFor(request), originFor(request, env)),
    )
    .delete('/api/account/plans/:planId', ({ request, params }) =>
      deleteAccountPlan(request, env, authFor(request), params.planId),
    )
    .post('/api/plans', ({ request }) => registerPlan(request, env, authFor(request), originFor(request, env)))
    .get('/api/plans/:planId/versions', ({ request, params }) => hostedPlanVersions(request, env, params.planId))
    .get('/api/auth/cli-session', ({ request }) => cliSession(request, env, authFor(request), new URL(request.url)))
    .get('/plans/:planId/view/:sig', ({ params }) => retiredViewLink(params.planId))
    .get('/plans/:planId/document', ({ request, params }) =>
      planDocument(request, env, authFor(request), params.planId, 'latest'),
    )
    .get('/plans/:planId/versions/:seq/document', ({ request, params }) =>
      planDocument(request, env, authFor(request), params.planId, versionSeq(params.seq)),
    )
    .all('/plans/:planId', ({ request, params }) => forwardPlan(request, env, authFor(request), params.planId, '/'))
    .all('/plans/:planId/*', ({ request, params }) => {
      const rest = params['*'] ? `/${params['*']}` : '/'
      return forwardPlan(request, env, authFor(request), params.planId, rest)
    })
}

export async function handleHostRequest(request: Request, env: HostEnv): Promise<Response> {
  if (!env.BETTER_AUTH_SECRET) return text(500, 'BETTER_AUTH_SECRET is not set.')
  if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') return upgradePlan(request, env)
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/auth/') && !url.pathname.startsWith('/api/auth/cli-session')) {
    return createAuthFor(env, request).handler(request)
  }
  return createHostApp(env).fetch(request)
}

async function upgradePlan(request: Request, env: HostEnv): Promise<Response> {
  const url = new URL(request.url)
  const planMatch = /^\/plans\/([A-Za-z0-9_-]{8,80})(\/.*)?$/.exec(url.pathname)
  if (!planMatch?.[1]) return text(404, 'Not found')
  const rest = planMatch[2] && planMatch[2] !== '/' ? planMatch[2] : '/'
  return forwardPlan(request, env, createAuthFor(env, request), planMatch[1], rest)
}

async function accountDashboardApi(
  request: Request,
  env: HostEnv,
  auth: ReturnType<typeof createAuth>,
  origin: string,
): Promise<Response> {
  const session = await readSession(auth, request, env.DB)
  if (!session) return text(401, 'Sign in required')
  const period = new URL(request.url).searchParams.get('period')
  const selected = period === 'week' || period === 'month' ? period : 'day'
  let rows: HostedPlanRow[]
  try {
    rows = await listHostedPlanRows(env, session.user.id)
  } catch {
    return text(500, 'Could not read the dashboard.')
  }
  return Response.json(hostedDashboard(await backfillHostedPlans(env, session.user.id, rows), selected, origin))
}

/** Hide a plan from the account dashboard. The row, its object, and its versions stay. */
async function deleteAccountPlan(
  request: Request,
  env: HostEnv,
  auth: ReturnType<typeof createAuth>,
  planId: string,
): Promise<Response> {
  const session = await readSession(auth, request, env.DB)
  if (!session) return text(401, 'Sign in required')
  if (!ID.test(planId)) return text(404, 'Plan not found')
  const result = await env.DB.prepare(
    `UPDATE plans SET meta = json_set(COALESCE(meta, '{}'), '$.deletedAt', ?) WHERE id = ? AND user_id = ?`,
  )
    .bind(Date.now(), planId, session.user.id)
    .run()
  if (!result.meta?.changes) return text(404, 'Plan not found')
  return Response.json({ ok: true })
}

async function listHostedPlanRows(env: HostEnv, userId: string): Promise<HostedPlanRow[]> {
  try {
    await ensurePlanVersions(env.DB)
    const listed = await env.DB.prepare(LATEST_PLAN_VERSION_SQL).bind(userId).all<HostedPlanRow>()
    return listed.results ?? []
  } catch {
    const listed = await env.DB.prepare(
      'SELECT id, title, mode, ended_at, started_at, meta FROM plans WHERE user_id = ? ORDER BY started_at DESC',
    )
      .bind(userId)
      .all<Omit<HostedPlanRow, 'version_seq' | 'version_title' | 'version_at'>>()
    return (listed.results ?? []).map((row) => ({
      ...row,
      version_seq: null,
      version_title: null,
      version_at: null,
    }))
  }
}

/** A plan saved before the versions table existed still has its document on the Durable Object. */
async function backfillHostedPlans(env: HostEnv, userId: string, rows: HostedPlanRow[]): Promise<HostedPlanRow[]> {
  const filled: HostedPlanRow[] = []
  for (const source of rows) {
    let row = source
    if (row.version_seq == null) {
      const version = await rememberPlanVersion(env, userId, row.id, row.title).catch(() => null)
      if (version) row = { ...row, version_seq: version.seq, version_title: version.title, version_at: version.createdAt }
    }
    // A plan last written before progress was saved is measured once here, then kept on its row.
    if (!hostedProgress(row.meta)) {
      const progress = await syncPlanProgress(env, row.id)
      if (progress) row = { ...row, meta: JSON.stringify({ ...parseMeta(row.meta), ...progress }) }
    }
    filled.push(row)
  }
  return filled
}

function parseMeta(meta: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(meta ?? '{}') as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * Measure the plan on its object and save the result on the D1 row the dashboard reads.
 * Best effort: a failure leaves the last saved progress and never fails the write that called it.
 */
async function syncPlanProgress(env: HostEnv, planId: string): Promise<ProgressFields | null> {
  try {
    const stub = env.PLANS.get(env.PLANS.idFromName(planId))
    const response = await stub.fetch(new Request('https://plan.internal/internal/progress'))
    if (!response.ok) return null
    const body = (await response.json()) as { progress?: ProgressFields | null }
    // A source that does not parse is saved as no progress, so the dashboard does not measure it again on every load.
    const progress = body.progress ?? NO_PROGRESS
    await saveHostedProgress(env.DB, planId, progress)
    return progress
  } catch {
    return null
  }
}

/** Writes that can change how far along a plan is. */
function changesProgress(method: string, rest: string): boolean {
  if (method === 'POST' && rest.startsWith('/api/interactions/')) return true
  if (method === 'POST' && /^\/api\/execution\/(start|push|stop)\/?$/.test(rest)) return true
  return method === 'PUT' && (rest === '/api/execution' || rest === '/api/execution/')
}

async function rememberPlanVersion(
  env: HostEnv,
  userId: string,
  planId: string,
  title: string | null,
): Promise<{ seq: number; title: string; createdAt: number } | null> {
  const viewResponse = await planFetch(env, planId, new Request('https://plan.internal/view'), '/view', 'account')
  if (!viewResponse.ok) return null
  const view = (await viewResponse.json()) as { title?: unknown; source?: unknown }
  if (typeof view.source !== 'string') return null
  const storedTitle = typeof view.title === 'string' && view.title.trim() ? view.title : title || 'Living plan'
  return publishPlanVersion(env.DB, { planId, userId, title: storedTitle, source: view.source })
}

async function accountRead(request: Request, env: HostEnv, auth: ReturnType<typeof createAuth>): Promise<Response> {
  const session = await readSession(auth, request, env.DB)
  if (!session) return text(401, 'Sign in required')
  const settings = await readAccountSettings(env.DB, session.user.id)
  return Response.json({
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name || session.user.email,
      tier: normalizeTier(session.user.tier),
    },
    settings,
    accounts: await listLinkedAccounts(env.DB, session.user.id),
    plans: await listOpenPlans(env, session.user.id),
  })
}

/** Appearance only. Plan pages read this instead of the whole account. */
async function accountSettingsRead(request: Request, env: HostEnv, auth: ReturnType<typeof createAuth>): Promise<Response> {
  const session = await readSession(auth, request, env.DB)
  if (!session) return text(401, 'Sign in required')
  return Response.json({ settings: await readAccountSettings(env.DB, session.user.id) })
}

async function accountUsageApi(request: Request, env: HostEnv, auth: ReturnType<typeof createAuth>): Promise<Response> {
  const session = await readSession(auth, request, env.DB)
  if (!session) return text(401, 'Sign in required')
  try {
    await ensurePlanVersions(env.DB)
    return Response.json(await readAccountUsage(env.DB, session.user.id, session.user.tier))
  } catch {
    return text(500, 'Could not read storage usage.')
  }
}

async function accountSave(request: Request, env: HostEnv, auth: ReturnType<typeof createAuth>): Promise<Response> {
  const session = await readSession(auth, request, env.DB)
  if (!session) return text(401, 'Sign in required')
  const patch = await request.json().catch(() => null)
  const settings = await saveAccountSettings(env.DB, session.user.id, patch)
  return Response.json({ settings })
}

async function listOpenPlans(env: HostEnv, userId: string): Promise<Array<{ id: string; title: string; mode: string }>> {
  const listed = await env.DB.prepare(
    'SELECT id, title, mode FROM plans WHERE user_id = ? AND status = ? ORDER BY started_at DESC',
  )
    .bind(userId, 'running')
    .all<{ id: string; title: string; mode: string }>()
  return listed.results ?? []
}

async function cliSession(request: Request, env: HostEnv, auth: ReturnType<typeof createAuth>, url: URL): Promise<Response> {
  const redirect = url.searchParams.get('redirect') ?? ''
  if (!isLoopback(redirect)) return text(400, 'The sign-in callback must be on this machine.')
  const session = await readSession(auth, request, env.DB)
  if (!session) return Response.redirect(new URL(`/login?cli=${encodeURIComponent(redirect)}`, url.origin).toString(), 302)
  const target = new URL(redirect)
  target.searchParams.set('token', session.session.token)
  return Response.redirect(target.toString(), 302)
}

async function registerPlan(request: Request, env: HostEnv, auth: ReturnType<typeof createAuth>, origin: string): Promise<Response> {
  const session = await readSession(auth, request, env.DB)
  if (!session || !allows('account', 'register')) return text(401, 'Sign in required')
  const body = (await request.json().catch(() => null)) as { cloudId?: string; mode?: string; title?: string; markdown?: string } | null
  if (!body) return text(400, 'Missing plan')
  const tier = normalizeTier(session.user.tier)
  const cloudId = body.cloudId && ID.test(body.cloudId) ? body.cloudId : crypto.randomUUID()
  const existing = await env.DB.prepare('SELECT id, user_id, token, status FROM plans WHERE id = ?').bind(cloudId).first<{
    id: string
    user_id: string
    token: string
    status: string
  }>()
  if (existing && existing.user_id !== session.user.id) return text(409, 'That plan belongs to another account.')
  const openRow = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM plans WHERE user_id = ? AND status = ? AND id != ?',
  )
    .bind(session.user.id, 'running', cloudId)
    .first<{ n: number }>()
  const reattach = Boolean(existing && existing.status === 'running')
  if (planCapReached(tier, Number(openRow?.n ?? 0), reattach)) {
    return text(402, `This ${tier} account can host ${PLAN_CAPS[tier]} active plan${PLAN_CAPS[tier] === 1 ? '' : 's'}.`)
  }
  const token = existing?.token ?? randomToken()
  const mode = body.mode === 'review' || body.mode === 'comment' ? body.mode : 'watch'
  const title = body.title?.slice(0, 200) || 'Living plan'
  const now = Date.now()
  if (existing) {
    await env.DB.prepare(
      `UPDATE plans SET status = 'running', ended_at = NULL, title = ?, mode = ?, heartbeat_at = ?, meta = json_remove(json_set(COALESCE(meta, '{}'), '$.tier', ?), '$.deletedAt') WHERE id = ?`,
    )
      .bind(title, mode, now, tier, cloudId)
      .run()
  } else {
    await env.DB.prepare(
      `INSERT INTO plans (id, user_id, token, title, mode, status, plan_path, started_at, ended_at, heartbeat_at, meta)
       VALUES (?, ?, ?, ?, ?, 'running', NULL, ?, NULL, ?, ?)`,
    )
      .bind(cloudId, session.user.id, token, title, mode, now, now, JSON.stringify({ tier }))
      .run()
  }
  const stub = env.PLANS.get(env.PLANS.idFromName(cloudId))
  const init = await stub.fetch(
    new Request('https://plan.internal/internal/init', {
      method: 'POST',
      headers: { 'x-living-plan-id': cloudId },
      body: JSON.stringify({ token, title, mode, tier, source: body.markdown ?? '' }),
    }),
  )
  if (!init.ok) return text(init.status, await init.text())
  const payload = (await init.json()) as { revision?: number }
  await syncPlanProgress(env, cloudId)
  await publishPlanVersion(env.DB, {
    planId: cloudId,
    userId: session.user.id,
    title,
    source: body.markdown ?? '',
  }).catch(() => undefined)
  return Response.json({
    plan: { id: cloudId, url: `${origin}/plans/${cloudId}/`, token, mode },
    revision: payload.revision ?? 0,
  })
}

/** Old signed view links no longer grant access. Send them to the plan, which asks for the owner's sign-in, and drop the old cookie. */
function retiredViewLink(planId: string): Response {
  const headers = new Headers({ location: `/plans/${planId}/` })
  headers.append('set-cookie', 'living_plan_view=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0')
  return new Response(null, { status: 302, headers })
}

type PlanAccess = { actor: PlanActor; signedIn: boolean }
type PlanActor = 'account' | 'viewer' | ''

/**
 * The role this request has on a plan. Only the owning account has access.
 * Sharing will return 'viewer' here for an account the owner added. The plan object already limits a viewer to read and submit.
 */
async function planAccess(session: AuthSession | null, env: HostEnv, planId: string): Promise<PlanAccess> {
  if (!session) return { actor: '', signedIn: false }
  const row = await env.DB.prepare('SELECT user_id FROM plans WHERE id = ?').bind(planId).first<{ user_id: string }>()
  return { actor: row && row.user_id === session.user.id ? 'account' : '', signedIn: true }
}

async function forwardPlan(
  request: Request,
  env: HostEnv,
  auth: ReturnType<typeof createAuth>,
  planId: string,
  rest: string,
): Promise<Response> {
  const session = await readSession(auth, request, env.DB)
  const { actor } = await planAccess(session, env, planId)
  const account = actor === 'account'
  if (request.method === 'DELETE') {
    if (!account && !bearerHeader(request)) return text(401, 'Sign in required')
    // The owner closes with the account. Anyone else must hold the plan bearer, which the object checks.
    const closed = await planFetch(env, planId, request, '/', account ? 'account' : '')
    if (!closed.ok) return closed
    await env.DB.prepare(`UPDATE plans SET status = 'executed', ended_at = ? WHERE id = ?`).bind(Date.now(), planId).run()
    return Response.json({ ok: true })
  }
  if (request.method === 'PUT' && (rest === '/source' || rest === '/source/')) {
    return publishSource(request, env, planId, actor)
  }
  const response = await planFetch(env, planId, request, rest || '/', actor)
  if (response.ok && changesProgress(request.method, rest)) await syncPlanProgress(env, planId)
  return response
}

export type HostedPlanPage = {
  title: string
  source: string
  mode: string
  revision: number
  responses: unknown
  comments: unknown
  review: unknown
  /** The live run, so the page opens showing it. */
  execution: { active?: boolean } | null
    owner: boolean
    email: string
    name: string
  accent: string
  pageWidth: 'default' | 'wide' | 'full'
  diffsTheme: string
  wrapCode: boolean
  settings: Awaited<ReturnType<typeof readAccountSettings>>
}

/** Plan document and session for the signed-in owner. */
export async function hostedPlanPage(request: Request, env: HostEnv, planId: string): Promise<Response> {
  const loaded = await loadHostedPlan(request, env, planId)
  if (loaded instanceof Response) return loaded
  return Response.json(loaded)
}

async function loadHostedPlan(request: Request, env: HostEnv, planId: string): Promise<HostedPlanPage | Response> {
  const origin = originFor(request, env)
  const auth = createAuth(env, origin)
  const session = await readSession(auth, request, env.DB)
  const { actor, signedIn } = await planAccess(session, env, planId)
  const account = actor === 'account'
  if (!actor) return signedIn ? text(403, 'This plan belongs to another account.') : text(401, 'Sign in required')
  const viewResponse = await planFetch(env, planId, request, '/view', actor)
  if (!viewResponse.ok) return viewResponse
  const view = (await viewResponse.json()) as {
    title: string
    source: string
    mode: string
    revision?: number
    responses: unknown
    comments: unknown
    review: unknown
    theme: { accent?: string } | null
    execution?: { active?: boolean } | null
  }
  const settings = account && session ? await readAccountSettings(env.DB, session.user.id) : defaultAccountSettings()
  return {
    title: view.title,
    source: view.source,
    mode: view.mode,
    revision: view.revision ?? 0,
    responses: view.responses,
    comments: view.comments,
    review: view.review,
    execution: view.execution ?? null,
    owner: account,
    email: session?.user.email ?? '',
    name: session?.user.name || session?.user.email || '',
    accent: account ? settings.accent : view.theme?.accent || '#0f766e',
    pageWidth: account ? settings.pageWidth : 'default',
    diffsTheme: account ? settings.diffsTheme : 'pierre',
    wrapCode: account ? settings.wrapCode : false,
    settings,
  }
}

async function publishSource(request: Request, env: HostEnv, planId: string, actor: string): Promise<Response> {
  const raw = await request.text()
  let body: { markdown?: unknown; title?: unknown }
  try {
    body = JSON.parse(raw) as { markdown?: unknown; title?: unknown }
  } catch {
    return text(400, 'Missing plan')
  }
  const forwarded = await planFetch(
    env,
    planId,
    new Request(request.url, { method: 'PUT', headers: request.headers, body: raw }),
    '/source',
    actor,
  )
  if (!forwarded.ok || typeof body.markdown !== 'string') return forwarded
  await syncPlanProgress(env, planId)
  const row = await env.DB.prepare('SELECT user_id, title FROM plans WHERE id = ?')
    .bind(planId)
    .first<{ user_id: string; title: string | null }>()
  if (!row) return forwarded
  const title = (typeof body.title === 'string' && body.title.trim() ? body.title : row.title || 'Living plan').slice(0, 200)
  await publishPlanVersion(env.DB, { planId, userId: row.user_id, title, source: body.markdown }).catch(() => undefined)
  if (typeof body.title === 'string' && body.title.trim()) {
    await env.DB.prepare('UPDATE plans SET title = ? WHERE id = ?').bind(title, planId).run()
  }
  return forwarded
}

async function planOwner(request: Request, env: HostEnv, auth: ReturnType<typeof createAuth>, planId: string): Promise<boolean> {
  const session = await readSession(auth, request, env.DB)
  if (!session) return false
  const row = await env.DB.prepare('SELECT user_id FROM plans WHERE id = ?').bind(planId).first<{ user_id: string }>()
  return Boolean(row && row.user_id === session.user.id)
}

async function planDocument(
  request: Request,
  env: HostEnv,
  auth: ReturnType<typeof createAuth>,
  planId: string,
  seq: number | 'latest',
): Promise<Response> {
  if (!(await planOwner(request, env, auth, planId))) return text(401, 'Sign in required')
  let version = await readPlanVersion(env.DB, planId, seq).catch(() => null)
  if (!version && seq === 'latest') {
    const row = await env.DB.prepare('SELECT user_id, title FROM plans WHERE id = ?')
      .bind(planId)
      .first<{ user_id: string; title: string | null }>()
    if (row) await rememberPlanVersion(env, row.user_id, planId, row.title).catch(() => null)
    version = await readPlanVersion(env.DB, planId, 'latest').catch(() => null)
  }
  if (!version) return text(404, 'This plan has no saved version.')
  const filename = `${version.title.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'plan'}.v${version.seq}.plan.md`
  return new Response(version.source, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  })
}

function versionSeq(value: string): number {
  return /^[1-9]\d{0,8}$/.test(value) ? Number(value) : 0
}

/** One saved version with the owner's page settings, for the read-only version page. */
export async function hostedPlanVersionPage(request: Request, env: HostEnv, planId: string, seq: string): Promise<Response> {
  const origin = originFor(request, env)
  const auth = createAuth(env, origin)
  const session = await readSession(auth, request, env.DB)
  if (!session || !(await planOwner(request, env, auth, planId))) return text(401, 'Sign in required')
  const number = versionSeq(seq)
  const version = number ? await readPlanVersion(env.DB, planId, number).catch(() => null) : null
  if (!version) return text(404, 'This version is not saved.')
  const settings = await readAccountSettings(env.DB, session.user.id)
  return Response.json({
    planId,
    seq: version.seq,
    title: version.title,
    source: version.source,
    createdAt: version.createdAt,
    email: session.user.email,
    name: session.user.name || session.user.email,
    accent: settings.accent,
    pageWidth: settings.pageWidth,
    diffsTheme: settings.diffsTheme,
    wrapCode: settings.wrapCode,
  })
}

async function versionsForPlan(env: HostEnv, planId: string): Promise<Array<{ seq: number; title: string; createdAt: number }>> {
  let versions = await listPlanVersions(env.DB, planId).catch(() => [])
  if (versions.length > 0) return versions
  const row = await env.DB.prepare('SELECT user_id, title FROM plans WHERE id = ?')
    .bind(planId)
    .first<{ user_id: string; title: string | null }>()
  if (row) await rememberPlanVersion(env, row.user_id, planId, row.title).catch(() => null)
  versions = await listPlanVersions(env.DB, planId).catch(() => [])
  return versions
}

/** Version list for the Start history page. */
export async function hostedPlanVersions(request: Request, env: HostEnv, planId: string): Promise<Response> {
  const origin = originFor(request, env)
  const auth = createAuth(env, origin)
  const session = await readSession(auth, request, env.DB)
  if (!session || !(await planOwner(request, env, auth, planId))) return text(401, 'Sign in required')
  const versions = await versionsForPlan(env, planId)
  return Response.json({
    title: versions[0]?.title ?? 'Living plan',
    planId,
    versions,
    name: session.user.name || session.user.email,
  })
}

async function planFetch(env: HostEnv, planId: string, request: Request, path: string, actor: string): Promise<Response> {
  const target = new URL(path, 'https://plan.internal')
  // Routes under /internal/ are for this Worker only. They do not check a caller.
  if (isInternalPath(target.pathname)) return text(404, 'Not found')
  const headers = new Headers(request.headers)
  headers.delete('x-living-plan-actor')
  if (actor) headers.set('x-living-plan-actor', actor)
  // The object saves its plan id, so it can keep agent presence on the dashboard row.
  headers.set('x-living-plan-id', planId)
  const stub = env.PLANS.get(env.PLANS.idFromName(planId))
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  return stub.fetch(new Request(target.toString(), hasBody ? { method: request.method, headers, body: request.body } : { method: request.method, headers }))
}

async function readSession(auth: ReturnType<typeof createAuth>, request: Request, db: D1Database): Promise<AuthSession | null> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (session?.user && session.session) return session as AuthSession
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')
  if (!match?.[1]) return null
  return sessionFromToken(db, match[1])
}

function isInternalPath(pathname: string): boolean {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return true
  }
  const path = new URL(decoded.toLowerCase(), 'https://plan.internal').pathname
  return path === '/internal' || path.startsWith('/internal/')
}

function bearerHeader(request: Request): boolean {
  return /^Bearer\s+\S+$/i.test(request.headers.get('authorization') ?? '')
}

function randomToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function isLoopback(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
  } catch {
    return false
  }
}

function text(status: number, message: string): Response {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
