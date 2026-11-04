import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Database } from 'bun:sqlite'
import { handleHostRequest, type HostEnv } from '../src/host/app.ts'
import { oAuthProxyPlugin } from '../src/host/auth.ts'

const production = 'https://plan.logspace.qzz.io'
const preview = 'https://pr-7-visual-living-plan.mcalderon-code.workers.dev'

function database(sqlite: Database): D1Database {
  const dir = new URL('../src/migrations/', import.meta.url)
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file, dir), 'utf8'))
  }
  const statementFor = (sql: string) => {
    const statement = sqlite.prepare(sql)
    const run = (...values: unknown[]) => ({
      async first<T>() {
        return (statement.get(...(values as never[])) as T | null) ?? null
      },
      async all<T>() {
        return { results: statement.all(...(values as never[])) as T[], meta: { changes: 0, last_row_id: 0, duration: 0 } }
      },
      async run() {
        statement.run(...(values as never[]))
        return { success: true, meta: { changes: sqlite.changes, last_row_id: 0, duration: 0 } }
      },
    })
    return { ...run(), bind: (...values: unknown[]) => run(...values) }
  }
  return {
    prepare: (sql: string) => statementFor(sql),
    async batch(statements: Array<{ all(): Promise<unknown> }>) {
      return Promise.all(statements.map((statement) => statement.all()))
    },
    async exec(sql: string) {
      sqlite.exec(sql)
      return { count: 0, duration: 0 }
    },
  } as unknown as D1Database
}

function hostEnv(sqlite: Database, secret: string): HostEnv {
  return {
    DB: database(sqlite),
    PLANS: { idFromName: () => 'id', get: () => ({ fetch: async () => new Response('missing', { status: 404 }) }) },
    BETTER_AUTH_SECRET: secret,
    PUBLIC_URL: production,
    TRUSTED_ORIGINS: 'https://*-visual-living-plan.mcalderon-code.workers.dev,https://*.plan.logspace.qzz.io',
    GITHUB_CLIENT_ID: 'github-client-id',
    GITHUB_CLIENT_SECRET: 'github-client-secret',
    OAUTH_PROXY_SECRET: 'shared-oauth-proxy-secret-at-least-32-chars',
  }
}

function cookiesFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

test('the OAuth proxy stays off without a production URL and a shared secret', () => {
  assert.equal(oAuthProxyPlugin({}), null)
  assert.equal(oAuthProxyPlugin({ PUBLIC_URL: production }), null)
  assert.equal(oAuthProxyPlugin({ OAUTH_PROXY_SECRET: 'secret' }), null)
  assert.equal(oAuthProxyPlugin({ PUBLIC_URL: production, OAUTH_PROXY_SECRET: 'secret' })?.id, 'oauth-proxy')
})

test('a preview signs in with GitHub through the production callback', async () => {
  const previewDb = new Database(':memory:')
  const productionDb = new Database(':memory:')
  const previewEnv = hostEnv(previewDb, 'preview-better-auth-secret-at-least-32-chars')
  const productionEnv = hostEnv(productionDb, 'production-better-auth-secret-at-least-32')

  const start = await handleHostRequest(
    new Request(`${preview}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: preview },
      body: JSON.stringify({ provider: 'github', callbackURL: '/settings' }),
    }),
    previewEnv,
  )
  assert.equal(start.status, 200)
  const previewCookies = cookiesFrom(start)
  const providerUrl = new URL(((await start.json()) as { url: string }).url)
  assert.equal(providerUrl.origin, 'https://github.com')
  assert.equal(providerUrl.searchParams.get('redirect_uri'), `${production}/api/auth/callback/github`)
  const state = providerUrl.searchParams.get('state')
  assert.ok(state)

  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.startsWith('https://github.com/login/oauth/access_token')) {
      return Response.json({ access_token: 'gho_token', token_type: 'bearer', scope: 'read:user,user:email' })
    }
    if (url === 'https://api.github.com/user') {
      return Response.json({ id: 4242, login: 'octo', name: 'Octo Cat', email: 'octo@example.com', avatar_url: '' })
    }
    if (url === 'https://api.github.com/user/emails') {
      return Response.json([{ email: 'octo@example.com', primary: true, verified: true }])
    }
    return realFetch(input)
  }) as typeof fetch
  let handoff: Response
  try {
    handoff = await handleHostRequest(
      new Request(`${production}/api/auth/callback/github?code=abc&state=${encodeURIComponent(state)}`),
      productionEnv,
    )
  } finally {
    globalThis.fetch = realFetch
  }
  assert.equal(handoff.status, 302)
  const back = new URL(handoff.headers.get('location') ?? '')
  assert.equal(back.origin, preview)
  assert.equal(back.pathname, '/api/auth/callback/github/oauth-proxy')
  const productionUsers = productionDb.query('SELECT COUNT(*) AS n FROM user').get() as { n: number }
  assert.equal(productionUsers.n, 0)

  const done = await handleHostRequest(new Request(back, { headers: { cookie: previewCookies } }), previewEnv)
  assert.equal(done.status, 302)
  assert.equal(done.headers.get('location'), '/settings')
  assert.match(cookiesFrom(done), /session_token=/)
  const user = previewDb.query('SELECT email FROM user').get() as { email: string } | null
  assert.equal(user?.email, 'octo@example.com')
})
