import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { Elysia } from 'elysia'
import { lanProtectedRequest } from '../src/lanAccess.ts'
import { registerPlanRoutes } from '../src/planRoutes.ts'
import { APPLE_TOUCH_ICON, FAVICON_16, FAVICON_32, FAVICON_ICO, manifestIcons, pwaIconFromAsset, pwaIconName } from '../src/pwaIcons.ts'
import { webManifestHead } from '../src/webManifest.ts'

const origin = 'http://127.0.0.1:9477'
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngSize(bytes: Uint8Array): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return [view.getUint32(16), view.getUint32(20)]
}

test('every listed icon is in public/icons at the size it claims', () => {
  for (const icon of manifestIcons) {
    const bytes = new Uint8Array(readFileSync(new URL(`../public${icon.src}`, import.meta.url)))
    assert.deepEqual([...bytes.subarray(0, 8)], PNG, icon.src)
    assert.equal(pngSize(bytes).join('x'), icon.sizes, icon.src)
  }
  for (const [src, size] of [[APPLE_TOUCH_ICON, 180], [FAVICON_32, 32], [FAVICON_16, 16]] as const) {
    const bytes = new Uint8Array(readFileSync(new URL(`../public${src}`, import.meta.url)))
    assert.deepEqual(pngSize(bytes), [size, size], src)
  }
  const ico = new Uint8Array(readFileSync(new URL(`../public${FAVICON_ICO}`, import.meta.url)))
  assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0])
})

test('icon paths stay inside /icons/', () => {
  assert.equal(pwaIconName('/icons/pwa-192x192.png'), 'pwa-192x192.png')
  assert.equal(pwaIconName('/favicon.ico'), 'favicon.ico')
  assert.equal(pwaIconName('/icons/../package.json'), undefined)
  assert.equal(pwaIconName('/icons/%2e%2e%2fsecret.png'), undefined)
  assert.equal(pwaIconName('/icons/notes.txt'), undefined)
  assert.equal(pwaIconName('/dashboard'), undefined)
})

test('the local service serves icons without a plan or the LAN secret', async () => {
  const app = registerPlanRoutes(new Elysia({ strictPath: true, aot: false }), {
    hosted: false,
    resolve: () => {
      throw new Error('icons do not need a plan session')
    },
  })
  const png = await app.fetch(new Request(`${origin}/icons/pwa-512x512.png`))
  assert.equal(png.status, 200)
  assert.equal(png.headers.get('content-type'), 'image/png')
  assert.deepEqual(pngSize(new Uint8Array(await png.arrayBuffer())), [512, 512])
  const ico = await app.fetch(new Request(`${origin}/favicon.ico`))
  assert.equal(ico.status, 200)
  assert.equal(ico.headers.get('content-type'), 'image/x-icon')
  const missing = await app.fetch(new Request(`${origin}/icons/nope.png`))
  assert.equal(missing.status, 404)
  assert.equal(lanProtectedRequest('GET', '/icons/pwa-192x192.png'), false)
  assert.equal(lanProtectedRequest('GET', '/favicon.ico'), false)
})

test('the hosted Worker keeps image assets and refuses an HTML fallback', async () => {
  const image = new Response(new Uint8Array(PNG), { headers: { 'content-type': 'image/png' } })
  assert.equal(pwaIconFromAsset(image), image)
  const html = new Response('<!DOCTYPE html>', { headers: { 'content-type': 'text/html' } })
  assert.equal(pwaIconFromAsset(html).status, 404)
  assert.equal(pwaIconFromAsset(null).status, 404)
  const entry = readFileSync(new URL('../src/entry.ts', import.meta.url), 'utf8')
  assert.match(entry, /pwaIconName\(url\.pathname\)/)
})

test('pages link the tab icons and the Apple touch icon', () => {
  assert.ok(webManifestHead.includes(`<link rel="apple-touch-icon" href="${APPLE_TOUCH_ICON}" />`))
  assert.ok(webManifestHead.includes(`href="${FAVICON_ICO}"`))
  const root = readFileSync(new URL('../src/routes/__root.tsx', import.meta.url), 'utf8')
  assert.match(root, /rel: 'apple-touch-icon', href: APPLE_TOUCH_ICON/)
})
