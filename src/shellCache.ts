/**
 * Browser shell cache for the hosted app and the local plan page.
 *
 * The cache name ends with the package version. A deploy that bumps the version
 * ships a new worker, and activate deletes every previous shell cache.
 *
 * Static assets are cache-first. HTML documents come from the network while it
 * is reachable, and from the cache only when that fetch fails. The cached
 * document is the shell. Plan rows live in the browser database, not in that
 * HTML. API, auth, server functions, sessions, and plan JSON stay on the
 * network.
 *
 * A service worker cannot read Cookie, so every document on this device shares
 * one cache key. Sign-out and sign-in delete those document entries and leave
 * the asset cache in place. The precache manifest is always fetched from the
 * network so install sees the current build.
 */

export const SHELL_CACHE_PREFIX = 'visual-living-plan-shell-'

/** Keep both equal to package.json `version`. test/shellCache.test.ts checks them. */
export const SHELL_CACHE_VERSION = '1.12.0'

export const SHELL_CACHE_NAME = 'visual-living-plan-shell-1.12.0'

/** One document cache per device. The worker cannot see which account is signed in. */
export const DOCUMENT_CACHE_MARKER = 'device'

export const PRECACHE_BATCH = 16

export type ShellKind = 'asset' | 'document' | 'network'

export type ShellCacheStore = {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
  addAll?(urls: readonly string[]): Promise<void>
  keys?(): Promise<readonly Request[]>
  delete?(request: Request): Promise<boolean>
}

export type ShellCacheStorage = {
  open(name: string): Promise<ShellCacheStore>
  keys(): Promise<readonly string[]>
  delete(name: string): Promise<boolean>
}

export type ShellRuntime = {
  cacheName: string
  caches: ShellCacheStorage
  fetch: (request: Request) => Promise<Response>
  origin: string
  waitUntil?: (promise: Promise<unknown>) => void
}

export type PrecacheClient = {
  fetch: (url: string) => Promise<Response>
  addAll: (urls: readonly string[]) => Promise<void>
  batchSize?: number
}

export type ForgetDocumentsMessage = {
  type: 'forget-documents'
  paths?: readonly string[]
  all?: boolean
}

const ASSET_EXTENSION = /\.(?:js|mjs|css|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|wasm)$/i

const PLAN_NETWORK =
  /^\/plans\/[^/]+\/(?:api|view|share|document|versions)(?:\/|$)/

export function classifyShellRequest(request: Request, origin: string): ShellKind {
  if (request.method !== 'GET') return 'network'
  if (request.headers.has('range')) return 'network'
  if (request.headers.has('authorization')) return 'network'
  const upgrade = request.headers.get('upgrade')
  if (upgrade && upgrade.toLowerCase() === 'websocket') return 'network'
  if (request.headers.get('x-tsr-serverfn') === 'true') return 'network'

  let url: URL
  try {
    url = new URL(request.url)
  } catch {
    return 'network'
  }
  if (url.origin !== origin) return 'network'

  const path = url.pathname
  if (path === '/sw.js') return 'network'
  if (path === '/precache-manifest.json') return 'network'
  if (path === '/api' || path.startsWith('/api/')) return 'network'
  if (PLAN_NETWORK.test(path)) return 'network'
  if (path === '/archive' || path.startsWith('/archive/')) return 'network'
  if (path.endsWith('.map')) return 'network'
  if (isAssetPath(path) || isAssetDestination(request)) return 'asset'
  if (isDocumentRequest(request)) return 'document'
  return 'network'
}

export function documentCacheRequest(request: Request): Request {
  const url = new URL(request.url)
  url.hash = ''
  url.pathname = normalizePath(url.pathname)
  url.searchParams.delete('__lp_shell')
  if (url.pathname === '/dashboard') url.searchParams.delete('period')
  url.searchParams.set('__lp_shell', DOCUMENT_CACHE_MARKER)
  return new Request(url.href, { method: 'GET' })
}

export function shouldStoreDocument(response: Response): boolean {
  if (response.status !== 200) return false
  if (response.type !== 'basic' && response.type !== 'default') return false
  if (response.headers.has('set-cookie')) return false
  return (response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')
}

export function shouldStoreAsset(response: Response): boolean {
  if (response.status !== 200) return false
  if (response.type !== 'basic' && response.type !== 'default') return false
  if (response.headers.has('set-cookie')) return false
  const type = (response.headers.get('content-type') ?? '').toLowerCase()
  if (type.includes('text/html') || type.includes('application/json') || type.includes('text/event-stream')) {
    return false
  }
  return true
}

export async function activateShellCaches(cacheStorage: Pick<ShellCacheStorage, 'keys' | 'delete'>): Promise<void> {
  const names = await cacheStorage.keys()
  await Promise.all(
    names
      .filter((name) => name.startsWith(SHELL_CACHE_PREFIX) && name !== SHELL_CACHE_NAME)
      .map((name) => cacheStorage.delete(name)),
  )
}

export function precacheAssetUrls(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== 'object') return []
  const urls = (manifest as { urls?: unknown }).urls
  if (!Array.isArray(urls)) return []
  const seen = new Set<string>()
  const list: string[] = []
  for (const entry of urls) {
    if (typeof entry !== 'string' || !entry.startsWith('/') || entry.endsWith('.map')) continue
    if (seen.has(entry)) continue
    seen.add(entry)
    list.push(entry)
  }
  return list
}

/** Fetch the build manifest and cache its assets. A missing manifest (dev) is a no-op. */
export async function precacheShell(manifestUrl: string, deps: PrecacheClient): Promise<void> {
  let response: Response
  try {
    response = await deps.fetch(manifestUrl)
  } catch {
    return
  }
  if (!response.ok) return
  let manifest: unknown
  try {
    manifest = await response.json()
  } catch {
    return
  }
  const urls = precacheAssetUrls(manifest)
  const size = deps.batchSize && deps.batchSize > 0 ? deps.batchSize : PRECACHE_BATCH
  const batches: string[][] = []
  for (let index = 0; index < urls.length; index += size) batches.push(urls.slice(index, index + size))
  await Promise.allSettled(batches.map((batch) => deps.addAll(batch)))
}

export function isForgetDocumentsMessage(value: unknown): value is ForgetDocumentsMessage {
  if (!value || typeof value !== 'object') return false
  return (value as { type?: unknown }).type === 'forget-documents'
}

/** Drop cached HTML. Asset entries have no `__lp_shell` key and stay. */
export async function forgetShellDocuments(
  cache: Pick<ShellCacheStore, 'keys' | 'delete'>,
  message: ForgetDocumentsMessage,
): Promise<void> {
  if (!cache.keys || !cache.delete) return
  const paths = new Set((message.paths ?? []).map((path) => normalizePath(path)))
  const keys = await cache.keys()
  await Promise.all(
    keys.map(async (request) => {
      const url = new URL(request.url)
      if (!url.searchParams.has('__lp_shell')) return
      if (!message.all && !paths.has(normalizePath(url.pathname))) return
      await cache.delete?.(request)
    }),
  )
}

export function offlineNoticeHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
<meta name="theme-color" content="#171717" media="(prefers-color-scheme: dark)" />
<title>Not on this device · Living Plan</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #ffffff; color: #181e25; font: 16px/1.5 "DM Sans", "Helvetica Neue", Helvetica, Arial, sans-serif; }
  main { max-width: 28rem; padding: 2rem; }
  h1 { font-size: 24px; font-weight: 600; line-height: 1.3; margin: 0 0 0.75rem; }
  p { margin: 0 0 1.25rem; color: #3f3f46; }
  a { color: #2563eb; font-weight: 500; }
  @media (prefers-color-scheme: dark) {
    body { background: #171717; color: #ededed; }
    p { color: #949494; }
    a { color: #0094fc; }
  }
</style>
</head>
<body>
<main>
  <h1>Not saved on this device</h1>
  <p>This plan is not saved on this device yet. Reconnect to open it.</p>
  <a href="/dashboard">Back to dashboard</a>
</main>
</body>
</html>`
}

export function offlineNoticeResponse(): Response {
  return new Response(offlineNoticeHtml(), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/** `null` means the browser should use the network without involving the shell cache. */
export function handleShellFetch(request: Request, deps: ShellRuntime): Promise<Response> | null {
  const kind = classifyShellRequest(request, deps.origin)
  if (kind === 'network') return null
  if (kind === 'asset') return cacheFirstAsset(request, deps)
  return networkFirstDocument(request, deps)
}

async function cacheFirstAsset(request: Request, deps: ShellRuntime): Promise<Response> {
  const cache = await deps.caches.open(deps.cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await deps.fetch(request)
  if (shouldStoreAsset(response)) await cache.put(request, response.clone())
  return response
}

async function networkFirstDocument(request: Request, deps: ShellRuntime): Promise<Response> {
  const cache = await deps.caches.open(deps.cacheName)
  const key = documentCacheRequest(request)
  try {
    const response = await deps.fetch(request)
    if (shouldStoreDocument(response)) await cache.put(key, response.clone())
    return response
  } catch {
    const cached = await cache.match(key)
    if (cached) return cached
    const url = new URL(request.url)
    if (normalizePath(url.pathname) === '/') {
      const dashboard = await cache.match(documentCacheRequest(new Request(`${url.origin}/dashboard`)))
      if (dashboard) return dashboard
    }
    return offlineNoticeResponse()
  }
}

function normalizePath(pathname: string): string {
  if (!pathname) return '/'
  if (pathname.length > 1) return pathname.replace(/\/+$/, '') || '/'
  return pathname
}

function isAssetPath(path: string): boolean {
  if (path === '/favicon.png' || path === '/manifest.webmanifest') return true
  if (path.startsWith('/client/') || path.startsWith('/assets/')) return true
  return ASSET_EXTENSION.test(path)
}

function isAssetDestination(request: Request): boolean {
  const destination = requestDestination(request)
  return destination === 'script' || destination === 'style' || destination === 'image' || destination === 'font' || destination === 'manifest'
}

function isDocumentRequest(request: Request): boolean {
  if (requestMode(request) === 'navigate') return true
  const destination = requestDestination(request)
  if (destination === 'document' || destination === 'iframe') return true
  return (request.headers.get('accept') ?? '').includes('text/html')
}

function requestMode(request: Request): string {
  return (request as Request & { mode?: string }).mode ?? ''
}

function requestDestination(request: Request): string {
  const destination = (request as Request & { destination?: string }).destination
  if (destination) return destination
  return request.headers.get('sec-fetch-dest') ?? ''
}
