/** Sent by the CLI so a local Worker can answer on the loopback host it was called on. */
export const LOOPBACK_ORIGIN_HEADER = 'x-living-plan-origin'

/**
 * Absolute origin for URLs this Worker returns.
 *
 * `wrangler dev` with a custom domain rewrites the request onto that public
 * hostname, including absolute URLs in headers. A value of `127.0.0.1:8787`
 * has no scheme, so it survives that rewrite. Honor it only when the
 * connection itself is loopback. A public client cannot aim returned URLs at
 * another host.
 *
 * A public request whose own origin matches `TRUSTED_ORIGINS` uses that
 * origin. A Worker Preview can then sign in on its own host while `PUBLIC_URL`
 * stays the production origin. Any other public request uses `PUBLIC_URL`.
 */
export function requestOrigin(request: Request, publicUrl?: string, trustedOrigins?: string): string {
  const hinted = loopbackOrigin(request.headers.get(LOOPBACK_ORIGIN_HEADER) ?? '')
  const connecting = request.headers.get('cf-connecting-ip') ?? ''
  if (hinted && (connecting === '127.0.0.1' || connecting === '::1')) return hinted
  const own = new URL(request.url).origin
  const patterns = parseTrustedOrigins(trustedOrigins)
  if (patterns.some((pattern) => originMatches(own, pattern))) return own
  return (publicUrl || own).replace(/\/$/, '')
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

/** Split a comma-separated list. Keep only `https://` patterns. */
export function parseTrustedOrigins(value?: string): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('https://'))
}

/**
 * Exact origin, or one `*` per run of `[a-z0-9-]` in the hostname.
 * `*` does not match a dot, the scheme, or a port. Hosts compare case-insensitively.
 * An origin or pattern with credentials, a path, a query, or a hash does not match.
 */
export function originMatches(origin: string, pattern: string): boolean {
  const originUrl = httpsOrigin(origin)
  const patternUrl = httpsOrigin(pattern)
  if (!originUrl || !patternUrl) return false
  if (originUrl.port !== patternUrl.port) return false
  if (patternUrl.port.includes('*')) return false
  const hostPattern = patternUrl.hostname
  if (!hostPattern.includes('*')) return originUrl.hostname === hostPattern
  const body = hostPattern.split('*').map(escapeRegExp).join('[a-z0-9-]+')
  return new RegExp(`^${body}$`, 'i').test(originUrl.hostname)
}

function httpsOrigin(value: string): URL | null {
  if (!value.startsWith('https://')) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    if (url.username || url.password) return null
    if (url.pathname !== '/' && url.pathname !== '') return null
    if (url.search || url.hash) return null
    return url
  } catch {
    return null
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
