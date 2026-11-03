import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Elysia } from 'elysia'
import { lanProtectedRequest } from '../src/lanAccess.ts'
import { registerPlanRoutes } from '../src/planRoutes.ts'
import { registerServiceWorker, type ServiceWorkerHost } from '../src/registerServiceWorker.ts'
import {
  activateShellCaches,
  classifyShellRequest,
  forgetShellDocuments,
  handleShellFetch,
  precacheShell,
  SHELL_CACHE_NAME,
  SHELL_CACHE_VERSION,
  type ShellCacheStorage,
  type ShellRuntime,
} from '../src/shellCache.ts'
import { readShellWorkerSource, shellWorkerResponse } from '../src/shellWorkerResponse.ts'

const origin = 'http://127.0.0.1:9477'

test('the shell cache name is the package version', async () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  assert.equal(SHELL_CACHE_VERSION, pkg.version)
  assert.equal(SHELL_CACHE_NAME, `visual-living-plan-shell-${pkg.version}`)
  const worker = await import('../src/shellWorker.js')
  assert.equal(worker.SHELL_CACHE_NAME, SHELL_CACHE_NAME)
  assert.equal(worker.SHELL_CACHE_VERSION, pkg.version)
  const source = readShellWorkerSource()
  assert.match(source, /visual-living-plan-shell-/)
  assert.match(source, new RegExp(`SHELL_CACHE_VERSION = "${pkg.version.replaceAll('.', '\\.')}"`))
  assert.match(source, /addEventListener\("install"/)
  assert.match(source, /addEventListener\("activate"/)
  assert.match(source, /addEventListener\("fetch"/)
  assert.match(source, /addEventListener\("message"/)
  assert.match(source, /precache-manifest\.json/)
  assert.match(source, /forget-documents/)
})

test('navigation and static assets are the shell, and API and auth stay on the network', () => {
  const cases: Array<[string, Request, 'asset' | 'document' | 'network']> = [
    ['script', asset('/assets/index-abc123.js'), 'asset'],
    ['style', asset('/assets/index-abc123.css'), 'asset'],
    ['local client', asset('/client/assets/main-abc123.js'), 'asset'],
    ['favicon', asset('/favicon.png'), 'asset'],
    ['font', asset('/fonts/plan.woff2'), 'asset'],
    ['hosted plan page', document('/plans/abcdefgh'), 'document'],
    ['local plan page', document('/plans/abcdefgh/'), 'document'],
    ['local sample', document('/local'), 'document'],
    ['login', document('/login'), 'document'],
    ['dashboard', document('/dashboard'), 'document'],
    ['history', document('/plans/abcdefgh/history'), 'document'],
    ['account api', json('/api/account'), 'network'],
    ['auth', json('/api/auth/get-session'), 'network'],
    ['plan json', json('/api/plan'), 'network'],
    ['plan mdx json', json('/plans/abcdefgh/api/plan-mdx'), 'network'],
    ['execution', json('/api/execution'), 'network'],
    ['events', json('/api/events'), 'network'],
    ['download', document('/plans/abcdefgh/document'), 'network'],
    ['version download', document('/plans/abcdefgh/versions/3'), 'network'],
    ['viewer link', document('/plans/abcdefgh/view/sig'), 'network'],
    ['share', document('/plans/abcdefgh/share'), 'network'],
    ['worker script', asset('/sw.js'), 'network'],
    ['precache manifest', asset('/precache-manifest.json'), 'network'],
    ['server function', serverFn('/dashboard'), 'network'],
    ['post', new Request(`${origin}/plans/abcdefgh`, { method: 'POST' }), 'network'],
    ['socket', new Request(`${origin}/plans/abcdefgh/api/events`, { headers: { upgrade: 'websocket' } }), 'network'],
    ['bearer', new Request(`${origin}/dashboard`, { headers: { authorization: 'Bearer secret', accept: 'text/html' } }), 'network'],
    ['other origin', new Request('https://fonts.googleapis.com/css2?family=DM+Sans', { headers: { accept: 'text/css' } }), 'network'],
  ]
  for (const [label, request, expected] of cases) {
    assert.equal(classifyShellRequest(request, origin), expected, label)
  }
})

test('static assets load from the cache after the first response', async () => {
  const runtime = memoryRuntime()
  const first = await handleShellFetch(asset('/client/assets/main-abc123.js'), runtime.deps)
  assert.equal(first?.status, 200)
  assert.equal(await first?.text(), 'main')
  assert.equal(runtime.fetches.length, 1)

  runtime.fetch = () => {
    throw new Error('asset should load from cache')
  }
  const second = await handleShellFetch(asset('/client/assets/main-abc123.js'), runtime.deps)
  assert.equal(await second?.text(), 'main')
  assert.equal(runtime.fetches.length, 1)
})

test('a document comes from the network while online and from the cache when that fetch fails', async () => {
  const runtime = memoryRuntime()
  const first = await handleShellFetch(document('/local'), runtime.deps)
  assert.equal(await first?.text(), '<html>one</html>')
  assert.equal(runtime.fetches.length, 1)

  runtime.pages.set('/local', '<html>two</html>')
  const second = await handleShellFetch(document('/local'), runtime.deps)
  assert.equal(await second?.text(), '<html>two</html>')
  assert.equal(runtime.fetches.length, 2)

  runtime.fetch = () => {
    throw new Error('offline')
  }
  const third = await handleShellFetch(document('/local'), runtime.deps)
  assert.equal(await third?.text(), '<html>two</html>')
})

test('documents on one device share a cache key', async () => {
  const runtime = memoryRuntime()
  const first = await handleShellFetch(document('/dashboard', 'session=alice'), runtime.deps)
  assert.equal(await first?.text(), '<html>one</html>')

  runtime.fetch = () => {
    throw new Error('the cookie is not part of the cache key')
  }
  const second = await handleShellFetch(document('/dashboard', 'session=bob'), runtime.deps)
  assert.equal(await second?.text(), '<html>one</html>')
  assert.equal(runtime.fetches.length, 1)
})

test('the start URL falls back to the cached dashboard', async () => {
  const runtime = memoryRuntime()
  runtime.pages.set('/dashboard', '<html>dash</html>')
  const stored = await handleShellFetch(document('/dashboard'), runtime.deps)
  assert.equal(await stored?.text(), '<html>dash</html>')

  runtime.fetch = () => {
    throw new Error('offline')
  }
  const home = await handleShellFetch(document('/'), runtime.deps)
  assert.equal(await home?.text(), '<html>dash</html>')
})

test('dashboard periods share one document cache key', async () => {
  const runtime = memoryRuntime()
  runtime.pages.set('/dashboard', '<html>day</html>')
  const day = await handleShellFetch(document('/dashboard?period=day'), runtime.deps)
  assert.equal(await day?.text(), '<html>day</html>')

  runtime.fetch = () => {
    throw new Error('offline')
  }
  const week = await handleShellFetch(document('/dashboard?period=week'), runtime.deps)
  assert.equal(await week?.text(), '<html>day</html>')
})

test('an uncached plan page is the offline notice', async () => {
  const runtime = memoryRuntime()
  runtime.fetch = () => {
    throw new Error('offline')
  }
  const page = await handleShellFetch(document('/plans/abcdefgh'), runtime.deps)
  assert.equal(page?.status, 200)
  assert.match(page?.headers.get('content-type') ?? '', /text\/html/)
  const html = await page?.text()
  assert.match(html ?? '', /This plan is not saved on this device yet/)
  assert.match(html ?? '', /href="\/dashboard"/)
})

test('precache stores assets in batches and tolerates a failed batch', async () => {
  const added: string[][] = []
  await precacheShell('/precache-manifest.json', {
    fetch: async () => Response.json({
      version: '1.12.0',
      urls: ['/assets/a.js', '/assets/b.css', '/assets/c.wasm', '/assets/d.js.map', 'https://example.com/nope.js'],
    }),
    addAll: async (urls) => {
      added.push([...urls])
      if (urls.includes('/assets/b.css')) throw new Error('missing')
    },
    batchSize: 1,
  })
  assert.deepEqual(added, [['/assets/a.js'], ['/assets/b.css'], ['/assets/c.wasm']])
})

test('a missing precache manifest does not fail install', async () => {
  let added = 0
  await precacheShell('/precache-manifest.json', {
    fetch: async () => {
      throw new Error('dev server')
    },
    addAll: async () => {
      added += 1
    },
  })
  assert.equal(added, 0)
})

test('forget-documents deletes documents and keeps assets', async () => {
  const runtime = memoryRuntime()
  await handleShellFetch(document('/plans/abcdefgh'), runtime.deps)
  await handleShellFetch(document('/plans/ijklmnop'), runtime.deps)
  await handleShellFetch(asset('/assets/app.js'), runtime.deps)
  const cache = await runtime.deps.caches.open(SHELL_CACHE_NAME)
  await forgetShellDocuments(cache, { paths: ['/plans/abcdefgh'] })
  const left = (await cache.keys?.()) ?? []
  const urls = left.map((request) => request.url).sort()
  assert.equal(urls.some((url) => url.includes('/plans/abcdefgh')), false)
  assert.equal(urls.some((url) => url.includes('/plans/ijklmnop')), true)
  assert.equal(urls.some((url) => url.includes('/assets/app.js')), true)

  await forgetShellDocuments(cache, { all: true })
  const after = (await cache.keys?.()) ?? []
  assert.deepEqual(after.map((request) => new URL(request.url).pathname), ['/assets/app.js'])
})

test('plan JSON, redirects, and session cookies are not stored', async () => {
  const runtime = memoryRuntime()
  runtime.fetch = async (request) => {
    runtime.fetches.push(request.url)
    const url = new URL(request.url)
    if (url.pathname.endsWith('/api/plan')) {
      return Response.json({ source: 'secret plan' })
    }
    if (url.pathname === '/login') {
      return new Response(null, { status: 302, headers: { location: '/dashboard', 'set-cookie': 'session=abc' } })
    }
    return new Response('<html>signed in</html>', {
      status: 200,
      headers: { 'content-type': 'text/html', 'set-cookie': 'session=abc' },
    })
  }

  assert.equal(await handleShellFetch(json('/api/plan'), runtime.deps), null)
  const redirect = await handleShellFetch(document('/login'), runtime.deps)
  assert.equal(redirect?.status, 302)
  const signedIn = await handleShellFetch(document('/dashboard'), runtime.deps)
  assert.equal(signedIn?.status, 200)

  runtime.fetch = async () => {
    throw new Error('nothing from those responses should be cached')
  }
  const login = await handleShellFetch(document('/login'), runtime.deps)
  const dashboard = await handleShellFetch(document('/dashboard'), runtime.deps)
  assert.match(await login?.text() ?? '', /not saved on this device/i)
  assert.match(await dashboard?.text() ?? '', /not saved on this device/i)
})

test('activate replaces older shell caches and leaves the current one', async () => {
  const storage = memoryCaches()
  await storage.open('visual-living-plan-shell-1.8.0')
  await storage.open(SHELL_CACHE_NAME)
  await storage.open('other-cache')
  await activateShellCaches(storage)
  assert.deepEqual([...(await storage.keys())].sort(), [SHELL_CACHE_NAME, 'other-cache'].sort())
})

test('the hosted worker and the local plan service serve the shell script', async () => {
  const source = readShellWorkerSource()
  const response = shellWorkerResponse(source)
  assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8')
  assert.equal(response.headers.get('cache-control'), 'no-cache')
  assert.equal(response.headers.get('service-worker-allowed'), '/')
  assert.match(await response.text(), new RegExp(SHELL_CACHE_NAME.replaceAll('.', '\\.')))

  const entry = readFileSync(new URL('../src/entry.ts', import.meta.url), 'utf8')
  assert.match(entry, /shellWorker\.js\?raw/)
  assert.match(entry, /SHELL_WORKER_PATH/)

  const app = registerPlanRoutes(new Elysia({ strictPath: true, aot: false }), {
    hosted: false,
    resolve: () => {
      throw new Error('the shell script does not need a plan session')
    },
  })
  const served = await app.fetch(new Request(`${origin}/sw.js`))
  assert.equal(served.status, 200)
  assert.equal(served.headers.get('content-type'), 'text/javascript; charset=utf-8')
  assert.match(await served.text(), /visual-living-plan-shell-/)
  assert.equal(lanProtectedRequest('GET', '/sw.js'), false)
})

test('the browser entries register the shell worker', () => {
  const client = readFileSync(new URL('../src/client.tsx', import.meta.url), 'utf8')
  const main = readFileSync(new URL('../client/main.tsx', import.meta.url), 'utf8')
  assert.match(client, /registerServiceWorker\(\)/)
  assert.match(client, /hydrateRoot/)
  assert.match(main, /registerServiceWorker\(\)/)

  const calls: Array<{ url: string; options?: { scope?: string; type?: string } }> = []
  const host: ServiceWorkerHost = {
    location: { protocol: 'http:', hostname: '127.0.0.1' },
    navigator: {
      serviceWorker: {
        register: (url, options) => {
          calls.push({ url, options })
          return Promise.resolve({})
        },
      },
    },
    document: { readyState: 'complete' },
    addEventListener: () => {
      throw new Error('already loaded')
    },
  }
  registerServiceWorker(host)
  assert.deepEqual(calls, [{ url: '/sw.js', options: { scope: '/', type: 'module' } }])

  calls.length = 0
  registerServiceWorker({ ...host, location: { protocol: 'http:', hostname: '192.168.1.20' } })
  assert.deepEqual(calls, [])
  registerServiceWorker(null)
  assert.deepEqual(calls, [])
})

function asset(path: string): Request {
  return new Request(`${origin}${path}`, { headers: { accept: '*/*', 'sec-fetch-dest': 'script' } })
}

function document(path: string, cookie?: string): Request {
  const headers = new Headers({ accept: 'text/html', 'sec-fetch-dest': 'document' })
  if (cookie) headers.set('cookie', cookie)
  return new Request(`${origin}${path}`, { headers })
}

function json(path: string): Request {
  return new Request(`${origin}${path}`, { headers: { accept: 'application/json' } })
}

function serverFn(path: string): Request {
  return new Request(`${origin}${path}`, {
    headers: { accept: 'application/json', 'x-tsr-serverfn': 'true' },
  })
}

function memoryRuntime(): ShellRuntime & {
  deps: ShellRuntime
  fetches: string[]
  pages: Map<string, string>
  fetch: ShellRuntime['fetch']
  settled: () => Promise<void>
} {
  const fetches: string[] = []
  const pages = new Map<string, string>()
  const pending: Promise<unknown>[] = []
  const storage = memoryCaches()
  const runtime = {
    fetches,
    pages,
    async fetch(request: Request) {
      fetches.push(request.url)
      const url = new URL(request.url)
      const body = pages.get(url.pathname) ?? '<html>one</html>'
      if (url.pathname.endsWith('.js')) {
        return new Response('main', { status: 200, headers: { 'content-type': 'text/javascript' } })
      }
      return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
    },
    async settled() {
      await Promise.all(pending)
    },
    get deps(): ShellRuntime {
      return {
        cacheName: SHELL_CACHE_NAME,
        caches: storage,
        fetch: (request) => runtime.fetch(request),
        origin,
        waitUntil: (promise) => {
          pending.push(promise)
        },
      }
    },
  }
  return runtime
}

function memoryCaches(): ShellCacheStorage {
  const stores = new Map<string, Map<string, Response>>()
  return {
    async open(name) {
      let store = stores.get(name)
      if (!store) {
        store = new Map()
        stores.set(name, store)
      }
      return {
        async match(request) {
          return store.get(request.url)?.clone()
        },
        async put(request, response) {
          store.set(request.url, response.clone())
        },
        async keys() {
          return [...store.keys()].map((url) => new Request(url))
        },
        async delete(request) {
          return store.delete(request.url)
        },
      }
    },
    async keys() {
      return [...stores.keys()]
    },
    async delete(name) {
      return stores.delete(name)
    },
  }
}
