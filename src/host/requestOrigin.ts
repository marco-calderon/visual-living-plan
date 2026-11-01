/** Sent by the CLI so a local Worker can answer on the loopback host it was called on. */
export const LOOPBACK_ORIGIN_HEADER = 'x-living-plan-origin'

/**
 * Absolute origin for URLs this Worker returns.
 *
 * `wrangler dev` with a custom domain rewrites the request onto that public
 * hostname, including absolute URLs in headers. A value of `127.0.0.1:8787`
 * has no scheme, so it survives that rewrite. Honor it only when the
 * connection itself is loopback. A public client cannot aim returned URLs at
 * another host. `PUBLIC_URL` still wins for a public connection.
 */
export function requestOrigin(request: Request, publicUrl?: string): string {
  const hinted = loopbackOrigin(request.headers.get(LOOPBACK_ORIGIN_HEADER) ?? '')
  const connecting = request.headers.get('cf-connecting-ip') ?? ''
  if (hinted && (connecting === '127.0.0.1' || connecting === '::1')) return hinted
  return (publicUrl || new URL(request.url).origin).replace(/\/$/, '')
}

/** `http://127.0.0.1:8787` or `127.0.0.1:8787`. Public hosts return null. */
export function loopbackOrigin(value: string): string | null {
  const raw = value.trim()
  if (!raw) return null
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`)
    if (url.username || url.password) return null
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return null
    return url.origin
  } catch {
    return null
  }
}
