import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Elysia } from 'elysia'
import { renderDashboardPage } from '../src/dashboardPage.ts'
import { createIdleExecutionState } from '../src/execution.ts'
import { lanProtectedRequest } from '../src/lanAccess.ts'
import { parsePlan } from '../src/parse.ts'
import { registerPlanRoutes } from '../src/planRoutes.ts'
import { renderRegistryPage } from '../src/registryPage.ts'
import { renderPlanPage } from '../src/render.ts'
import { classifyShellRequest } from '../src/shellCache.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'
import { WEB_MANIFEST_PATH, webManifest, webManifestResponse } from '../src/webManifest.ts'

const origin = 'http://127.0.0.1:9477'

test('the manifest has what browsers need to offer install', async () => {
  const manifest = webManifest()
  assert.equal(manifest.name, 'Living Plan')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.id, '/')
  assert.equal(manifest.start_url, '/dashboard')
  assert.equal(manifest.scope, '/')
  for (const purpose of ['any', 'maskable'] as const) {
    const sizes = manifest.icons.filter((entry) => entry.purpose === purpose).map((entry) => entry.sizes)
    assert.ok(sizes.includes('192x192'), `a 192px ${purpose} icon is listed`)
    assert.ok(sizes.includes('512x512'), `a 512px ${purpose} icon is listed`)
  }

  const response = webManifestResponse()
  assert.equal(response.headers.get('content-type'), 'application/manifest+json; charset=utf-8')
  assert.deepEqual(await response.json(), manifest)
})

test('the local service serves the manifest without a plan or the LAN secret', async () => {
  const app = registerPlanRoutes(new Elysia({ strictPath: true, aot: false }), {
    hosted: false,
    resolve: () => {
      throw new Error('the manifest does not need a plan session')
    },
  })
  const served = await app.fetch(new Request(`${origin}${WEB_MANIFEST_PATH}`))
  assert.equal(served.status, 200)
  assert.equal((await served.json()).name, 'Living Plan')
  assert.equal(lanProtectedRequest('GET', WEB_MANIFEST_PATH), false)
})

test('the hosted Worker serves the manifest and the root page links it', () => {
  const entry = readFileSync(new URL('../src/entry.ts', import.meta.url), 'utf8')
  assert.match(entry, /WEB_MANIFEST_PATH\) return webManifestResponse\(\)/)
  const root = readFileSync(new URL('../src/routes/__root.tsx', import.meta.url), 'utf8')
  assert.match(root, /rel: 'manifest', href: WEB_MANIFEST_PATH/)
  assert.match(root, /name: 'theme-color'/)
})

test('the plan, dashboard, and registry pages link the manifest', () => {
  const planHtml = renderPlanPage({
    plan: parsePlan('# Notes\n\nNo diagram here.\n'),
    mode: 'watch',
    responses: {},
    diffs: [],
    iteration: 1,
    pendingInteractionIds: [],
    execution: createIdleExecutionState(),
    clientAssets: null,
    theme: themePayload(defaultThemeConfig(), 'live-plan.config.json'),
  })
  for (const html of [planHtml, renderDashboardPage(), renderRegistryPage()]) {
    assert.ok(html.includes(`<link rel="manifest" href="${WEB_MANIFEST_PATH}" />`))
    assert.ok(html.includes('<meta name="theme-color"'))
  }
})

test('the shell cache keeps the manifest for offline launch', () => {
  const request = new Request(`${origin}${WEB_MANIFEST_PATH}`)
  assert.equal(classifyShellRequest(request, origin), 'asset')
})
