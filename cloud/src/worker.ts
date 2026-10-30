import { PLAN_CAPS, allows, normalizeTier, planCapReached } from './access'
import { defaultAccountSettings, readAccountSettings, saveAccountSettings } from './accountSettings'
import { createAuth, type AuthSession } from './auth'
import { cloudAccountRoute, renderDashboard } from './dashboardPage'
import { renderLoginPage } from './loginPage'
import { PlanObject } from './planObject'
import { renderCloudPage, type CloudPageAssets } from './page'
export { PlanObject }

export interface Env {
  DB: D1Database
  PLANS: DurableObjectNamespace<PlanObject>
  ASSETS: Fetcher
  BETTER_AUTH_SECRET: string
  PUBLIC_URL?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
}

const ID = /^[A-Za-z0-9_-]{8,80}$/

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.BETTER_AUTH_SECRET) return text(500, 'BETTER_AUTH_SECRET is not set.')
    const url = new URL(request.url)
    if (url.pathname.startsWith('/client/') || url.pathname === '/favicon.png') {
      return env.ASSETS.fetch(request)
    }
    const origin = (env.PUBLIC_URL || url.origin).replace(/\/$/, '')
    const auth = createAuth(env, origin)

    if (url.pathname.startsWith('/api/auth/')) {
      if (url.pathname === '/api/auth/cli-session') return cliSession(request, auth, url)
      return auth.handler(request)
    }
    if (url.pathname === '/api/account' && request.method === 'GET') return accountRead(request, env, auth)
    if (url.pathname === '/api/account/settings' && request.method === 'PUT') return accountSave(request, env, auth)
    const accountRoute = cloudAccountRoute(url.pathname)
    if (accountRoute === 'redirect') return Response.redirect(new URL('/dashboard', request.url).toString(), 302)
    if (accountRoute === 'show') return accountDashboard(request, env, auth)
    if (url.pathname === '/login') {
      const cli = url.searchParams.get('cli') ?? ''
      if (cli && !isLoopback(cli)) return text(400, 'The sign-in callback must be on this machine.')
      return html(
        renderLoginPage({
          google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
          github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
          cli,
        }),
      )
    }
    if (url.pathname === '/api/plans' && request.method === 'POST') return registerPlan(request, env, auth, origin)
    if (url.pathname === '/api/health') return Response.json({ ok: true })

    const planMatch = /^\/plans\/([A-Za-z0-9_-]{8,80})(\/.*)?$/.exec(url.pathname)
    if (!planMatch) return text(404, 'Not found')
    const planId = planMatch[1] ?? ''
    const rest = planMatch[2] ?? '/'
    if (rest === '/share' && request.method === 'GET') return sharePlan(request, env, auth, origin, planId)
    if (rest.startsWith('/view/')) return acceptViewer(request, env, planId, rest.slice('/view/'.length))
    return forwardPlan(request, env, auth, planId, rest)
  },
}

async function accountDashboard(request: Request, env: Env, auth: ReturnType<typeof createAuth>): Promise<Response> {
  const session = await readSession(auth, request)
  if (!session) return Response.redirect(new URL('/login', request.url).toString(), 302)
  const settings = await readAccountSettings(env.DB, session.user.id)
  const plans = await listOpenPlans(env, session.user.id)
  return html(
    renderDashboard({
      email: session.user.email,
      name: session.user.name || session.user.email,
      tier: normalizeTier(session.user.tier),
      settings,
      plans,
    }),
  )
}

async function accountRead(request: Request, env: Env, auth: ReturnType<typeof createAuth>): Promise<Response> {
  const session = await readSession(auth, request)
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

async function accountSave(request: Request, env: Env, auth: ReturnType<typeof createAuth>): Promise<Response> {
  const session = await readSession(auth, request)
  if (!session) return text(401, 'Sign in required')
  const patch = await request.json().catch(() => null)
  const settings = await saveAccountSettings(env.DB, session.user.id, patch)
  return Response.json({ settings })
}

async function listOpenPlans(env: Env, userId: string): Promise<Array<{ id: string; title: string; mode: string }>> {
  const listed = await env.DB.prepare(
    'SELECT id, title, mode FROM plans WHERE user_id = ? AND closed_at IS NULL ORDER BY created_at DESC',
  )
    .bind(userId)
    .all<{ id: string; title: string; mode: string }>()
  return listed.results ?? []
}

async function cliSession(request: Request, auth: ReturnType<typeof createAuth>, url: URL): Promise<Response> {
  const redirect = url.searchParams.get('redirect') ?? ''
  if (!isLoopback(redirect)) return text(400, 'The sign-in callback must be on this machine.')
  const session = await readSession(auth, request)
  if (!session) return Response.redirect(new URL(`/login?cli=${encodeURIComponent(redirect)}`, url.origin).toString(), 302)
  const target = new URL(redirect)
  target.searchParams.set('token', session.session.token)
  return Response.redirect(target.toString(), 302)
}

async function registerPlan(request: Request, env: Env, auth: ReturnType<typeof createAuth>, origin: string): Promise<Response> {
  const session = await readSession(auth, request)
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
  return Response.json({
    plan: { id: cloudId, url: `${origin}/plans/${cloudId}/`, token, mode },
    revision: payload.revision ?? 0,
  })
}

async function sharePlan(
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
  origin: string,
  planId: string,
): Promise<Response> {
  const session = await readSession(auth, request)
  const row = await env.DB.prepare('SELECT user_id FROM plans WHERE id = ?').bind(planId).first<{ user_id: string }>()
  if (!session || !row || row.user_id !== session.user.id) return text(401, 'Sign in required')
  const sig = await signPlan(env.BETTER_AUTH_SECRET, planId)
  return Response.json({ url: `${origin}/plans/${planId}/view/${sig}` })
}

async function acceptViewer(request: Request, env: Env, planId: string, sig: string): Promise<Response> {
  const expected = await signPlan(env.BETTER_AUTH_SECRET, planId)
  if (!timingSafe(expected, sig)) return text(401, 'This review link is not valid.')
  const headers = new Headers({ location: `/plans/${planId}/` })
  headers.append('set-cookie', viewerCookie(planId, sig, new URL(request.url).protocol === 'https:'))
  return new Response(null, { status: 302, headers })
}

async function forwardPlan(
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
  planId: string,
  rest: string,
): Promise<Response> {
  const session = await readSession(auth, request)
  const row = await env.DB.prepare('SELECT user_id FROM plans WHERE id = ?').bind(planId).first<{ user_id: string }>()
  const viewer = await viewerFor(request, env, planId)
  const account = Boolean(session && row && row.user_id === session.user.id)
  const actor = account ? 'account' : viewer ? 'viewer' : ''
  const page = request.method === 'GET' && (rest === '/' || rest === '')
  if (page) {
    if (!actor) return html(signInRequired(), 401)
    const viewResponse = await planFetch(env, planId, request, '/view', actor)
    if (!viewResponse.ok) return viewResponse
    const view = (await viewResponse.json()) as {
      title: string
      source: string
      mode: string
      responses: unknown
      comments: unknown
      review: unknown
      theme: { accent?: string } | null
    }
    const assets = await loadAssets(env, request)
    const settings = account && session ? await readAccountSettings(env.DB, session.user.id) : defaultAccountSettings()
    return html(
      renderCloudPage({
        basePath: `/plans/${planId}`,
        title: view.title,
        source: view.source,
        mode: view.mode,
        responses: view.responses,
        comments: view.comments,
        review: view.review,
        accent: account ? settings.accent : view.theme?.accent || '#0f766e',
        pageWidth: account ? settings.pageWidth : 'default',
        diffsTheme: account ? settings.diffsTheme : 'pierre',
        wrapCode: account ? settings.wrapCode : false,
        owner: account,
        email: session?.user.email ?? '',
        settings,
        assets,
      }),
    )
  }
  if (request.method === 'DELETE') {
    if (!account && !bearerHeader(request)) return text(401, 'Sign in required')
    const closed = await planFetch(env, planId, request, '/', actor || 'plan')
    if (!closed.ok && closed.status !== 401) return closed
    await env.DB.prepare('UPDATE plans SET closed_at = ? WHERE id = ?').bind(Date.now(), planId).run()
    return Response.json({ ok: true })
  }
  return planFetch(env, planId, request, rest || '/', actor)
}

async function planFetch(env: Env, planId: string, request: Request, path: string, actor: string): Promise<Response> {
  const headers = new Headers(request.headers)
  headers.delete('x-living-plan-actor')
  if (actor) headers.set('x-living-plan-actor', actor)
  const stub = env.PLANS.get(env.PLANS.idFromName(planId))
  const target = new URL(path, 'https://plan.internal')
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  return stub.fetch(new Request(target, hasBody ? { method: request.method, headers, body: request.body } : { method: request.method, headers }))
}

async function loadAssets(env: Env, request: Request): Promise<CloudPageAssets> {
  const empty: CloudPageAssets = { planMdxHref: null, planMdxCss: [], selectorHref: null, selectorCss: [] }
  try {
    const manifestResponse = await env.ASSETS.fetch(new Request(new URL('/client/.vite/manifest.json', request.url)))
    if (!manifestResponse.ok) return empty
    const manifest = (await manifestResponse.json()) as Record<string, { file: string; css?: string[]; isEntry?: boolean; name?: string }>
    const plan = manifest['client/planMdx.tsx'] ?? Object.values(manifest).find((entry) => entry.name === 'planMdx')
    const selector = manifest['client/PlanSelector.tsx'] ?? Object.values(manifest).find((entry) => entry.name === 'selector')
    return {
      planMdxHref: plan ? `/client/${plan.file}` : null,
      planMdxCss: (plan?.css ?? []).map((file) => `/client/${file}`),
      selectorHref: selector ? `/client/${selector.file}` : null,
      selectorCss: (selector?.css ?? []).map((file) => `/client/${file}`),
    }
  } catch {
    return empty
  }
}

async function readSession(auth: ReturnType<typeof createAuth>, request: Request): Promise<AuthSession | null> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user || !session.session) return null
  return session as AuthSession
}

async function viewerFor(request: Request, env: Env, planId: string): Promise<boolean> {
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

function signInRequired(): string {
  return `<!doctype html><meta charset="utf-8" /><title>Sign in · Living Plan</title><p>Sign in to open this plan.</p><p><a href="/login">Sign in</a></p>`
}

function text(status: number, message: string): Response {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}
