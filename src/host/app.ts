import { Elysia } from 'elysia'
import { PLAN_CAPS, allows, normalizeTier, planCapReached } from './access'
import { defaultAccountSettings, readAccountSettings, saveAccountSettings } from './accountSettings'
import { createAuth, sessionFromToken, type AuthSession } from './auth'
import { hostedDashboard, type HostedPlanRow } from './hostedDashboard'
import { LATEST_PLAN_VERSION_SQL, ensurePlanVersions, listPlanVersions, publishPlanVersion, readPlanVersion } from './planVersions'
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
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
}

const ID = /^[A-Za-z0-9_-]{8,80}$/

function authFor(env: HostEnv, request: Request) {
  return createAuth(env, requestOrigin(request, env.PUBLIC_URL))
}

/** HTTP routes for the hosted app. WebSocket upgrades stay outside this app so the Durable Object socket is not copied into a new Response. */
export function createHostApp(env: HostEnv) {
  return new Elysia({ strictPath: true })
    .onError(({ code, error }) => {
      if (code === 'NOT_FOUND') return text(404, 'Not found')
      return text(500, error instanceof Error ? error.message : 'Unknown error')
    })
    .get('/api/health', () => ({ ok: true }))
    .get('/api/account', ({ request }) => accountRead(request, env, authFor(env, request)))
    .put('/api/account/settings', ({ request }) => accountSave(request, env, authFor(env, request)))
    .get('/api/account/dashboard', ({ request }) =>
      accountDashboardApi(request, env, authFor(env, request), requestOrigin(request, env.PUBLIC_URL)),
    )
    .post('/api/plans', ({ request }) => registerPlan(request, env, authFor(env, request), requestOrigin(request, env.PUBLIC_URL)))
    .get('/api/auth/cli-session', ({ request }) => cliSession(request, env, authFor(env, request), new URL(request.url)))
    .all('/api/auth/*', ({ request }) => authFor(env, request).handler(request))
    .get('/plans/:planId/share', ({ request, params }) =>
      sharePlan(request, env, authFor(env, request), requestOrigin(request, env.PUBLIC_URL), params.planId),
    )
    .get('/plans/:planId/view/:sig', ({ request, params }) => acceptViewer(request, env, params.planId, params.sig))
    .get('/plans/:planId/document', ({ request, params }) =>
      planDocument(request, env, authFor(env, request), params.planId, 'latest'),
    )
    .get('/plans/:planId/versions/:seq', ({ request, params }) =>
      planDocument(request, env, authFor(env, request), params.planId, Number(params.seq)),
    )
    .all('/plans/:planId', ({ request, params }) => forwardPlan(request, env, authFor(env, request), params.planId, '/'))
    .all('/plans/:planId/*', ({ request, params }) => {
      const rest = params['*'] ? `/${params['*']}` : '/'
      return forwardPlan(request, env, authFor(env, request), params.planId, rest)
    })
}

export async function handleHostRequest(request: Request, env: HostEnv): Promise<Response> {
  if (!env.BETTER_AUTH_SECRET) return text(500, 'BETTER_AUTH_SECRET is not set.')
  if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') return upgradePlan(request, env)
  return createHostApp(env).fetch(request)
}

async function upgradePlan(request: Request, env: HostEnv): Promise<Response> {
  const url = new URL(request.url)
  const planMatch = /^\/plans\/([A-Za-z0-9_-]{8,80})(\/.*)?$/.exec(url.pathname)
  if (!planMatch?.[1]) return text(404, 'Not found')
  const rest = planMatch[2] && planMatch[2] !== '/' ? planMatch[2] : '/'
  return forwardPlan(request, env, authFor(env, request), planMatch[1], rest)
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

async function listHostedPlanRows(env: HostEnv, userId: string): Promise<HostedPlanRow[]> {
  try {
    await ensurePlanVersions(env.DB)
    const listed = await env.DB.prepare(LATEST_PLAN_VERSION_SQL).bind(userId).all<HostedPlanRow>()
    return listed.results ?? []
  } catch {
    const listed = await env.DB.prepare(
      'SELECT id, title, mode, closed_at, created_at FROM plans WHERE user_id = ? ORDER BY created_at DESC',
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
  for (const row of rows) {
    if (row.version_seq != null) {
      filled.push(row)
      continue
    }
    const version = await rememberPlanVersion(env, userId, row.id, row.title).catch(() => null)
    filled.push(
      version
        ? { ...row, version_seq: version.seq, version_title: version.title, version_at: version.createdAt }
        : row,
    )
  }
  return filled
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
    plans: await listOpenPlans(env, session.user.id),
  })
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
    'SELECT id, title, mode FROM plans WHERE user_id = ? AND closed_at IS NULL ORDER BY created_at DESC',
  )
    .bind(userId)
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
  const existing = await env.DB.prepare('SELECT id, user_id, token, closed_at FROM plans WHERE id = ?').bind(cloudId).first<{
    id: string
    user_id: string
    token: string
    closed_at: number | null
  }>()
  if (existing && existing.user_id !== session.user.id) return text(409, 'That plan belongs to another account.')
  const openRow = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM plans WHERE user_id = ? AND closed_at IS NULL AND id != ?',
  )
    .bind(session.user.id, cloudId)
    .first<{ n: number }>()
  const reattach = Boolean(existing && existing.closed_at == null)
  if (planCapReached(tier, Number(openRow?.n ?? 0), reattach)) {
    return text(402, `This ${tier} account can host ${PLAN_CAPS[tier]} active plan${PLAN_CAPS[tier] === 1 ? '' : 's'}.`)
  }
  const token = existing?.token ?? randomToken()
  const mode = body.mode === 'review' || body.mode === 'comment' ? body.mode : 'watch'
  const title = body.title?.slice(0, 200) || 'Living plan'
  if (existing) {
    await env.DB.prepare('UPDATE plans SET closed_at = NULL, title = ?, mode = ?, tier = ? WHERE id = ?')
      .bind(title, mode, tier, cloudId)
      .run()
  } else {
    await env.DB.prepare(
      'INSERT INTO plans (id, user_id, token, title, mode, tier, closed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)',
    )
      .bind(cloudId, session.user.id, token, title, mode, tier, Date.now())
      .run()
  }
  const stub = env.PLANS.get(env.PLANS.idFromName(cloudId))
  const init = await stub.fetch(
    new Request('https://plan.internal/internal/init', {
      method: 'POST',
      body: JSON.stringify({ token, title, mode, tier, source: body.markdown ?? '' }),
    }),
  )
  if (!init.ok) return text(init.status, await init.text())
  const payload = (await init.json()) as { revision?: number }
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

async function sharePlan(
  request: Request,
  env: HostEnv,
  auth: ReturnType<typeof createAuth>,
  origin: string,
  planId: string,
): Promise<Response> {
  const session = await readSession(auth, request, env.DB)
  const row = await env.DB.prepare('SELECT user_id FROM plans WHERE id = ?').bind(planId).first<{ user_id: string }>()
  if (!session || !row || row.user_id !== session.user.id) return text(401, 'Sign in required')
  const sig = await signPlan(env.BETTER_AUTH_SECRET, planId)
  return Response.json({ url: `${origin}/plans/${planId}/view/${sig}` })
}

async function acceptViewer(request: Request, env: HostEnv, planId: string, sig: string): Promise<Response> {
  const expected = await signPlan(env.BETTER_AUTH_SECRET, planId)
  if (!timingSafe(expected, sig)) return text(401, 'This review link is not valid.')
  const headers = new Headers({ location: `/plans/${planId}/` })
  headers.append('set-cookie', viewerCookie(planId, sig, new URL(request.url).protocol === 'https:'))
  return new Response(null, { status: 302, headers })
}

async function forwardPlan(
  request: Request,
  env: HostEnv,
  auth: ReturnType<typeof createAuth>,
  planId: string,
  rest: string,
): Promise<Response> {
  const session = await readSession(auth, request, env.DB)
  const row = await env.DB.prepare('SELECT user_id FROM plans WHERE id = ?').bind(planId).first<{ user_id: string }>()
  const viewer = await viewerFor(request, env, planId)
  const account = Boolean(session && row && row.user_id === session.user.id)
  const actor = account ? 'account' : viewer ? 'viewer' : ''
  if (request.method === 'DELETE') {
    if (!account && !bearerHeader(request)) return text(401, 'Sign in required')
    const closed = await planFetch(env, planId, request, '/', actor || 'plan')
    if (!closed.ok && closed.status !== 401) return closed
    await env.DB.prepare('UPDATE plans SET closed_at = ? WHERE id = ?').bind(Date.now(), planId).run()
    return Response.json({ ok: true })
  }
  if (request.method === 'PUT' && (rest === '/source' || rest === '/source/')) {
    return publishSource(request, env, planId, actor)
  }
  return planFetch(env, planId, request, rest || '/', actor)
}

export type HostedPlanPage = {
  title: string
  source: string
  mode: string
  revision: number
  responses: unknown
  comments: unknown
  review: unknown
    owner: boolean
    email: string
    name: string
  accent: string
  pageWidth: 'default' | 'wide' | 'full'
  diffsTheme: string
  wrapCode: boolean
  settings: Awaited<ReturnType<typeof readAccountSettings>>
}

/** Plan document and session for the signed-in account or a viewer cookie. */
export async function hostedPlanPage(request: Request, env: HostEnv, planId: string): Promise<Response> {
  const loaded = await loadHostedPlan(request, env, planId)
  if (loaded instanceof Response) return loaded
  return Response.json(loaded)
}

async function loadHostedPlan(request: Request, env: HostEnv, planId: string): Promise<HostedPlanPage | Response> {
  const origin = requestOrigin(request, env.PUBLIC_URL)
  const auth = createAuth(env, origin)
  const session = await readSession(auth, request, env.DB)
  const row = await env.DB.prepare('SELECT user_id FROM plans WHERE id = ?').bind(planId).first<{ user_id: string }>()
  const viewer = await viewerFor(request, env, planId)
  const account = Boolean(session && row && row.user_id === session.user.id)
  const actor = account ? 'account' : viewer ? 'viewer' : ''
  if (!actor) return text(401, 'Sign in required')
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
  const origin = requestOrigin(request, env.PUBLIC_URL)
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
  const headers = new Headers(request.headers)
  headers.delete('x-living-plan-actor')
  if (actor) headers.set('x-living-plan-actor', actor)
  const stub = env.PLANS.get(env.PLANS.idFromName(planId))
  const target = new URL(path, 'https://plan.internal').toString()
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  return stub.fetch(new Request(target, hasBody ? { method: request.method, headers, body: request.body } : { method: request.method, headers }))
}

async function readSession(auth: ReturnType<typeof createAuth>, request: Request, db: D1Database): Promise<AuthSession | null> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (session?.user && session.session) return session as AuthSession
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')
  if (!match?.[1]) return null
  return sessionFromToken(db, match[1])
}

async function viewerFor(request: Request, env: HostEnv, planId: string): Promise<boolean> {
  const cookie = readCookie(request.headers.get('cookie'), 'living_plan_view')
  if (!cookie) return false
  const split = cookie.indexOf('.')
  if (split === -1) return false
  if (cookie.slice(0, split) !== planId) return false
  const expected = await signPlan(env.BETTER_AUTH_SECRET, planId)
  return timingSafe(expected, cookie.slice(split + 1))
}

async function signPlan(secret: string, planId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(planId))
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function viewerCookie(planId: string, sig: string, secure: boolean): string {
  return `living_plan_view=${planId}.${sig}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${secure ? '; Secure' : ''}`
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() !== name) continue
    return decodeURIComponent(part.slice(separator + 1).trim())
  }
  return null
}

function timingSafe(expected: string, actual: string): boolean {
  const left = new TextEncoder().encode(expected)
  const right = new TextEncoder().encode(actual)
  if (left.length !== right.length || left.length === 0) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) diff |= (left[index] ?? 0) ^ (right[index] ?? 0)
  return diff === 0
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
