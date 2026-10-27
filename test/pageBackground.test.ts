import assert from 'node:assert/strict'
import test from 'node:test'
import { createIdleExecutionState } from '../src/execution.ts'
import { parsePlan } from '../src/parse.ts'
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

test('the plan page uses a theme-aware graph paper grid', () => {
  const css = pageCss()
  const dark = css.split(':root[data-theme="dark"]')[1]
  assert.ok(dark)

  assert.match(css, /--grid-major:\s*color-mix\(in srgb, var\(--accent\) 34%, transparent\)/)
  assert.match(css, /--grid-minor:\s*color-mix\(in srgb, var\(--accent\) 16%, transparent\)/)
  assert.match(dark, /--grid-major:\s*color-mix\(in srgb, var\(--accent\) 26%, transparent\)/)
  assert.match(dark, /--grid-minor:\s*color-mix\(in srgb, var\(--accent\) 12%, transparent\)/)

  assert.match(css, /background-color:\s*var\(--paper\)/)
  assert.match(css, /linear-gradient\(var\(--grid-major\) 2px, transparent 2px\)/)
  assert.match(css, /linear-gradient\(90deg, var\(--grid-major\) 2px, transparent 2px\)/)
  assert.match(css, /linear-gradient\(var\(--grid-minor\) 1px, transparent 1px\)/)
  assert.match(css, /linear-gradient\(90deg, var\(--grid-minor\) 1px, transparent 1px\)/)
  assert.match(css, /background-size:\s*100px 100px, 100px 100px, 20px 20px, 20px 20px/)
  assert.match(css, /background-position:\s*-2px -2px, -2px -2px, -1px -1px, -1px -1px/)
  assert.match(css, /background-attachment:\s*fixed/)

  assert.doesNotMatch(css, /#269/)
  assert.doesNotMatch(css, /body::before/)
  assert.doesNotMatch(css, /radial-gradient\(1200px/)
  assert.doesNotMatch(css, /--noise-opacity/)
})
