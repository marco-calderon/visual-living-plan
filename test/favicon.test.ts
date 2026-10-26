import assert from 'node:assert/strict'
import test from 'node:test'
import { renderDashboardPage } from '../src/dashboardPage.ts'
import { createIdleExecutionState } from '../src/execution.ts'
import { faviconResponse } from '../src/favicon.ts'
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
