import { createServer } from 'node:http'
import { planApiUrl } from './agentEvents'
import { CLI_TOKEN_PATH } from './cliToken'
import { normalizeBase } from './cloudStore'

export type CloudRegistration = {
  id: string
  url: string
  token: string
  mode: string
  revision: number
}

const LOOPBACK_ORIGIN_HEADER = 'x-living-plan-origin'

function bearer(token: string, resourceUrl: string): Record<string, string> {
  const headers: Record<string, string> = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  const origin = loopbackOrigin(resourceUrl)
  if (origin) headers[LOOPBACK_ORIGIN_HEADER] = new URL(origin).host
  return headers
}

function loopbackOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return null
    return url.origin
  } catch {
    return null
  }
}

/** Keep a loopback publish on the host the CLI called. A public host may still return its own URL. */
export function planUrlOnCalledOrigin(baseUrl: string, returnedUrl: string): string {
  const base = new URL(normalizeBase(baseUrl))
  const returned = new URL(returnedUrl)
  if (returned.origin === base.origin) return returned.toString()
  const pinned = loopbackOrigin(base.origin)
  if (!pinned) return returned.toString()
  return new URL(`${returned.pathname}${returned.search}${returned.hash}`, pinned).toString()
}

async function errorText(response: Response): Promise<string> {
  const text = (await response.text()).trim()
  return text || `Request failed (${response.status})`
}

export function isLoopbackRedirect(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
  } catch {
    return false
  }
}

/** Open the hosted sign-in page and wait for the loopback callback. */
export async function loginCloudAccount(
  baseUrl: string,
  open: (url: string) => Promise<void>,
): Promise<{ baseUrl: string; token: string }> {
  const base = normalizeBase(baseUrl)
  const token = await new Promise<string>((resolveLogin, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        response.writeHead(404)
        response.end()
        return
      }
      const received = url.searchParams.get('token')
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end('<!doctype html><title>Signed in</title><p>You can close this window and return to the terminal.</p>')
      server.close()
      if (!received) reject(new Error('The hosted sign-in did not return a session.'))
      else resolveLogin(received)
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Could not listen for the sign-in callback.'))
        return
      }
      const callback = `http://127.0.0.1:${address.port}/callback`
      void open(`${base}/login?cli=${encodeURIComponent(callback)}`).catch(reject)
    })
    server.on('error', reject)
    setTimeout(() => {
      server.close()
      reject(new Error('Timed out waiting for sign-in.'))
    }, 5 * 60_000).unref()
  })
  return { baseUrl: base, token }
}

/** Confirm a pasted token with the host before saving it. Returns the account email. */
export async function verifyCloudToken(
  baseUrl: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ baseUrl: string; token: string; email: string }> {
  const base = normalizeBase(baseUrl)
  const { 'content-type': _json, ...headers } = bearer(token, base)
  const response = await fetchImpl(new URL('/api/account', base), { headers })
  if (response.status === 401) {
    throw new Error(`That token is not valid or has expired. Open ${base}${CLI_TOKEN_PATH} for a new one.`)
  }
  if (!response.ok) throw new Error(await errorText(response))
  const payload = (await response.json()) as { user?: { email?: string } }
  if (!payload.user?.email) throw new Error('The hosted service did not return an account.')
  return { baseUrl: base, token, email: payload.user.email }
}

export async function registerCloudPlan(
  baseUrl: string,
  accountToken: string,
  body: { cloudId?: string; mode: string; iteration?: number; title: string; markdown: string },
): Promise<CloudRegistration> {
  const base = normalizeBase(baseUrl)
  const response = await fetch(new URL('/api/plans', base), {
    method: 'POST',
    headers: bearer(accountToken, base),
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(await errorText(response))
  const payload = (await response.json()) as {
    plan?: { id?: string; url?: string; token?: string; mode?: string }
    revision?: number
  }
  if (!payload.plan?.id || !payload.plan.url || !payload.plan.token) {
    throw new Error('The hosted service did not return a plan.')
  }
  return {
    id: payload.plan.id,
    url: planUrlOnCalledOrigin(baseUrl, payload.plan.url),
    token: payload.plan.token,
    mode: payload.plan.mode ?? body.mode,
    revision: typeof payload.revision === 'number' ? payload.revision : 0,
  }
}

function pageEditConflict(raw: string): boolean {
  try {
    return (JSON.parse(raw) as { pageEdit?: unknown }).pageEdit === true
  } catch {
    return false
  }
}

function jsonRevision(raw: string): number | null {
  try {
    const parsed = JSON.parse(raw) as { revision?: unknown }
    return typeof parsed.revision === 'number' ? parsed.revision : null
  } catch {
    return null
  }
}

export async function uploadSource(options: {
  planUrl: string
  token: string
  markdown: string
  revision: number
  title?: string
  fetchImpl?: typeof fetch
}): Promise<number> {
  const fetchImpl = options.fetchImpl ?? fetch
  const send = (revision: number) =>
    fetchImpl(planApiUrl(options.planUrl, 'source'), {
      method: 'PUT',
      headers: bearer(options.token, options.planUrl),
      body: JSON.stringify({ markdown: options.markdown, revision, title: options.title }),
    })
  let response = await send(options.revision)
  if (response.status === 409) {
    const raw = await response.text()
    // Retrying would overwrite what a person published from the page. The agent pulls it first.
    if (pageEditConflict(raw)) {
      throw new Error(
        'A person edited this plan on the page since your last upload, so your file was not uploaded. Run `live-plan events --url <plan-url>` to write their version into the plan file, then make your change again.',
      )
    }
    const stale = jsonRevision(raw)
    if (stale == null) throw new Error(raw.trim() || 'The hosted plan rejected the upload.')
    response = await send(stale)
  }
  if (!response.ok) throw new Error(await errorText(response))
  const payload = (await response.json()) as { revision?: number }
  if (typeof payload.revision !== 'number') throw new Error('The hosted plan did not return a revision.')
  return payload.revision
}

export async function uploadJson(planUrl: string, token: string, path: string, body: unknown): Promise<void> {
  const response = await fetch(planApiUrl(planUrl, path), {
    method: 'PUT',
    headers: bearer(token, planUrl),
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(await errorText(response))
}

export async function closeCloudPlan(planUrl: string, token: string): Promise<void> {
  // No body, so no content type. The host parses a JSON content type and rejects an empty body.
  const { 'content-type': _json, ...headers } = bearer(token, planUrl)
  const response = await fetch(planApiUrl(planUrl, ''), {
    method: 'DELETE',
    headers,
  })
  if (response.status === 404 || response.ok) return
  throw new Error(await errorText(response))
}
