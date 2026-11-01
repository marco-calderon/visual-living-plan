import assert from 'node:assert/strict'
import test from 'node:test'
import { createIdleExecutionState } from '../src/execution.ts'
import { parsePlan } from '../src/parse.ts'
import { renderDashboardPage } from '../src/dashboardPage.ts'
import { renderRegistryPage } from '../src/registryPage.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'

function pageCss(): string {
  const plan = parsePlan(
    `---
title: Grid
---

# Hi
`,
    'grid.plan.md',
  )
  const html = renderPlanPage({
    plan,
    mode: 'watch',
    responses: {},
    diffs: [],
    iteration: 1,
    pendingInteractionIds: [],
    execution: createIdleExecutionState(),
    clientAssets: null,
    theme: themePayload(defaultThemeConfig(), 'live-plan.config.json'),
  })
  const styleStart = html.indexOf('<style>')
  const styleEnd = html.indexOf('</style>')
  assert.ok(styleStart >= 0 && styleEnd > styleStart)
  return html.slice(styleStart, styleEnd)
}

test('the plan page is a flat document canvas', () => {
  const css = pageCss()
  const dark = css.split(':root[data-theme="dark"]')[1]
  assert.ok(dark)

  assert.match(css, /--canvas:\s*#ffffff/)
  assert.match(css, /--surface:\s*#f4f4f5/)
  assert.match(css, /--ink:\s*#18181b/)
  assert.match(css, /--charcoal:\s*#27272a/)
  assert.match(css, /--primary:\s*#09090b/)
  assert.match(css, /--focus:\s*var\(--brand-blue-deep\)/)
  assert.match(dark, /--canvas:\s*#0c0c0e/)
  assert.match(dark, /--surface:\s*#18181b/)
  assert.match(dark, /--ink:\s*#fafafa/)
  assert.match(dark, /--charcoal:\s*#e4e4e7/)
  assert.match(dark, /--primary:\s*#fafafa/)
  assert.match(dark, /--on-primary:\s*#0c0c0e/)
  assert.match(dark, /--focus:\s*#93c5fd/)
  assert.match(css, /background-color:\s*var\(--canvas\)/)
  assert.match(css, /background-image:\s*none/)
  assert.doesNotMatch(css, /--grid-major/)
  assert.doesNotMatch(css, /--grid-minor/)
  assert.doesNotMatch(css, /linear-gradient\(var\(--grid/)
  assert.doesNotMatch(css, /#269/)
  assert.doesNotMatch(css, /body::before/)
  assert.doesNotMatch(css, /radial-gradient\(1200px/)
  assert.doesNotMatch(css, /--noise-opacity/)
})

test('dashboard and registry follow the same document in both color schemes', () => {
  for (const html of [renderDashboardPage(), renderRegistryPage()]) {
    assert.match(html, /--canvas:\s*#ffffff/)
    assert.match(html, /--surface:\s*#f4f4f5/)
    assert.match(html, /--primary:\s*#09090b/)
    assert.match(html, /@media \(prefers-color-scheme: dark\)/)
    const dark = html.split('@media (prefers-color-scheme: dark)')[1] ?? ''
    assert.match(dark, /--canvas:\s*#0c0c0e/)
    assert.match(dark, /--surface:\s*#18181b/)
    assert.match(dark, /--primary:\s*#fafafa/)
    assert.match(dark, /--on-primary:\s*#0c0c0e/)
    assert.match(html, /--font-body:\s*"DM Sans"/)
    assert.match(html, /font-family:\s*var\(--font-body\)/)
    assert.doesNotMatch(html, /Fraunces|IBM Plex|radial-gradient/)
  }
})
