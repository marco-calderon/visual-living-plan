import assert from 'node:assert/strict'
import test from 'node:test'
import { renderDashboardPage } from '../src/dashboardPage.ts'
import { createIdleExecutionState } from '../src/execution.ts'
import { readFileSync } from 'node:fs'
import { faviconBase64 } from '../src/faviconBase64.ts'
import { faviconFromAsset, faviconResponse } from '../src/favicon.ts'
import { parsePlan } from '../src/parse.ts'
import { renderRegistryPage } from '../src/registryPage.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'

const iconLink = '<link rel="icon" type="image/png" href="/favicon.png" />'

test('the plan, dashboard, and registry pages link the favicon', () => {
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
    assert.ok(html.includes(iconLink))
  }
})

test('favicon.png is the circle mark', async () => {
  const response = faviconResponse()
  assert.equal(response.headers.get('content-type'), 'image/png')
  const bytes = new Uint8Array(await response.arrayBuffer())
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
})

test('the embedded mark matches favicon.png', () => {
  const file = new Uint8Array(readFileSync(new URL('../src/favicon.png', import.meta.url)))
  const binary = atob(faviconBase64)
  const embedded = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  assert.deepEqual(embedded, file)
})

test('the title bar logo does not use an HTML document as the image', async () => {
  const html = new Response('<!DOCTYPE html><html></html>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
  const response = await faviconFromAsset(html)
  assert.equal(response.headers.get('content-type'), 'image/png')
  const bytes = new Uint8Array(await response.arrayBuffer())
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const image = new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } })
  const kept = await faviconFromAsset(image)
  assert.equal(kept, image)
})
