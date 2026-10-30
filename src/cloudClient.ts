import { createServer } from 'node:http'
import { planApiUrl } from './agentEvents'
import { normalizeBase } from './cloudStore'

export type CloudRegistration = {
  id: string
  url: string
  token: string
  mode: string
  revision: number
}

function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
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

export async function registerCloudPlan(
  baseUrl: string,
  accountToken: string,
  body: { cloudId?: string; mode: string; title: string; markdown: string },
): Promise<CloudRegistration> {
  const response = await fetch(new URL('/api/plans', normalizeBase(baseUrl)), {
    method: 'POST',
    headers: bearer(accountToken),
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
    url: payload.plan.url,
    token: payload.plan.token,
    mode: payload.plan.mode ?? body.mode,
    revision: typeof payload.revision === 'number' ? payload.revision : 0,
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
      headers: bearer(options.token),
      body: JSON.stringify({ markdown: options.markdown, revision, title: options.title }),
    })
  let response = await send(options.revision)
  if (response.status === 409) {
    const stale = (await response.json().catch(() => null)) as { revision?: number } | null
    if (typeof stale?.revision !== 'number') throw new Error('The hosted plan rejected a stale revision.')
    response = await send(stale.revision)
  }
  if (!response.ok) throw new Error(await errorText(response))
  const payload = (await response.json()) as { revision?: number }
  if (typeof payload.revision !== 'number') throw new Error('The hosted plan did not return a revision.')
  return payload.revision
}

export async function uploadJson(planUrl: string, token: string, path: string, body: unknown): Promise<void> {
  const response = await fetch(planApiUrl(planUrl, path), {
    method: 'PUT',
    headers: bearer(token),
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(await errorText(response))
}

/** Browser URL that sets the viewer cookie, so the opened plan is not asked to sign in again. */
export async function hostedViewUrl(planUrl: string, accountToken: string): Promise<string | null> {
  try {
    const response = await fetch(planApiUrl(planUrl, 'share'), {
      headers: { authorization: `Bearer ${accountToken}` },
    })
    if (!response.ok) return null
    const payload = (await response.json()) as { url?: string }
    if (!payload.url) return null
    const target = new URL(payload.url)
    if (target.origin !== new URL(planUrl).origin) return null
    return target.toString()
  } catch {
    return null
  }
}

export async function closeCloudPlan(planUrl: string, token: string): Promise<void> {
  const response = await fetch(planApiUrl(planUrl, ''), {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
  if (response.status === 404 || response.ok) return
  throw new Error(await errorText(response))
}
