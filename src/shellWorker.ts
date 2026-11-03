import {
  activateShellCaches,
  classifyShellRequest,
  forgetShellDocuments,
  handleShellFetch,
  isForgetDocumentsMessage,
  precacheShell,
  SHELL_CACHE_NAME,
  SHELL_CACHE_VERSION,
  type ShellCacheStorage,
} from './shellCache.ts'

export { activateShellCaches, classifyShellRequest, handleShellFetch, SHELL_CACHE_NAME, SHELL_CACHE_VERSION }

type WorkerEvent = {
  request?: Request
  data?: unknown
  waitUntil(promise: Promise<unknown>): void
  respondWith?(response: Promise<Response>): void
}

type BrowserScope = {
  addEventListener(type: string, listener: (event: WorkerEvent) => void): void
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
    event.waitUntil((async () => {
      const cache = await scope.caches.open(SHELL_CACHE_NAME)
      await precacheShell(new URL('/precache-manifest.json', scope.location.origin).href, {
        fetch: (url) => scope.fetch(new Request(url, { cache: 'no-store' })),
        add: async (url) => {
          if (cache.add) {
            await cache.add(new Request(url))
            return
          }
          const response = await scope.fetch(new Request(url))
          if (!response.ok) throw new Error(`precache ${response.status}`)
          await cache.put(new Request(url), response)
        },
      })
      await scope.skipWaiting()
    })())
  })
  scope.addEventListener('activate', (event) => {
    event.waitUntil(activateShellCaches(scope.caches).then(() => scope.clients.claim()))
  })
  scope.addEventListener('fetch', (event) => {
    if (!event.request || !event.respondWith) return
    const response = handleShellFetch(event.request, {
      cacheName: SHELL_CACHE_NAME,
      caches: scope.caches,
      fetch: (request) => scope.fetch(request),
      origin: scope.location.origin,
      waitUntil: (promise) => event.waitUntil(promise),
    })
    if (response) event.respondWith(response)
  })
  scope.addEventListener('message', (event) => {
    if (!isForgetDocumentsMessage(event.data)) return
    const message = event.data
    event.waitUntil((async () => {
      const cache = await scope.caches.open(SHELL_CACHE_NAME)
      await forgetShellDocuments(cache, message)
    })())
  })
}
