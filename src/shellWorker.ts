import {
  activateShellCaches,
  classifyShellRequest,
  handleShellFetch,
  SHELL_CACHE_NAME,
  SHELL_CACHE_VERSION,
  type ShellCacheStorage,
} from './shellCache.ts'

export { activateShellCaches, classifyShellRequest, handleShellFetch, SHELL_CACHE_NAME, SHELL_CACHE_VERSION }

type BrowserFetchEvent = {
  request: Request
  waitUntil(promise: Promise<unknown>): void
  respondWith(response: Promise<Response>): void
}

type BrowserScope = {
  addEventListener(type: string, listener: (event: BrowserFetchEvent) => void): void
  skipWaiting(): Promise<void>
  clients: { claim(): Promise<void> }
  caches: ShellCacheStorage
  fetch(request: Request): Promise<Response>
  location: { origin: string }
}

function inServiceWorker(scope: object): boolean {
  const ctor = (scope as { ServiceWorkerGlobalScope?: unknown }).ServiceWorkerGlobalScope
  return typeof ctor === 'function' && scope instanceof (ctor as new () => object)
}

if (inServiceWorker(globalThis)) {
  const scope = globalThis as unknown as BrowserScope
  scope.addEventListener('install', (event) => {
    event.waitUntil(scope.skipWaiting())
  })
  scope.addEventListener('activate', (event) => {
    event.waitUntil(activateShellCaches(scope.caches).then(() => scope.clients.claim()))
  })
  scope.addEventListener('fetch', (event) => {
    const response = handleShellFetch(event.request, {
      cacheName: SHELL_CACHE_NAME,
      caches: scope.caches,
      fetch: (request) => scope.fetch(request),
      origin: scope.location.origin,
      waitUntil: (promise) => event.waitUntil(promise),
    })
    if (response) event.respondWith(response)
  })
}
