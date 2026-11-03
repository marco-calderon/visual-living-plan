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
 * network. A document is stored under a hash of the request cookie so one
 * account's page is not reused for another.
 */

export const SHELL_CACHE_PREFIX = 'visual-living-plan-shell-'

/** Keep both equal to package.json `version`. test/shellCache.test.ts checks them. */
export const SHELL_CACHE_VERSION = '1.11.1'

export const SHELL_CACHE_NAME = 'visual-living-plan-shell-1.11.1'

export type ShellKind = 'asset' | 'document' | 'network'

export type ShellCacheStore = {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
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
  if (path === '/api' || path.startsWith('/api/')) return 'network'
  if (PLAN_NETWORK.test(path)) return 'network'
  if (path === '/archive' || path.startsWith('/archive/')) return 'network'
  if (path.endsWith('.map')) return 'network'
  if (isAssetPath(path) || isAssetDestination(request)) return 'asset'
  if (isDocumentRequest(request)) return 'document'
  return 'network'
}

export async function sessionMarker(cookie: string | null): Promise<string> {
  const value = cookie?.trim() ?? ''
  if (!value) return 'anon'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function documentCacheRequest(request: Request): Promise<Request> {
  const url = new URL(request.url)
  url.hash = ''
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  url.searchParams.delete('__lp_shell')
  url.searchParams.set('__lp_shell', await sessionMarker(request.headers.get('cookie')))
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
  const key = await documentCacheRequest(request)
  try {
    const response = await deps.fetch(request)
    if (shouldStoreDocument(response)) await cache.put(key, response.clone())
    return response
  } catch (error) {
    const cached = await cache.match(key)
    if (cached) return cached
    throw error
  }
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
