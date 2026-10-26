import assert from 'node:assert/strict'
import test from 'node:test'
import { createIdleExecutionState } from '../src/execution.ts'
import { parsePlan } from '../src/parse.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'

const plan = parsePlan(
  `---
title: POS-22 Google Ads scripts migration (AI-DLC)
summary: POS-30 in review.
agent: claude-code
---

# Scope

Keep the account structure.
`,
  'pos-22.plan.md',
)

function page(): string {
  return renderPlanPage({
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
}

test('the fixed title bar keeps the logo, title, icon tabs, and Plans', () => {
  const html = page()
  const barStart = html.indexOf('<header class="titlebar">')
  const barEnd = html.indexOf('</header>')
  assert.ok(barStart >= 0 && barEnd > barStart)
  const bar = html.slice(barStart, barEnd)

  assert.match(bar, /<img class="titlebar-logo" src="\/favicon.png" alt="Living Plan"/)
  assert.match(bar, /<h1 class="brand">POS-22 Google Ads scripts migration \(AI-DLC\)<\/h1>/)
  assert.match(bar, /aria-label="Plan"/)
  assert.match(bar, /aria-label="Workflow"/)
  assert.match(bar, /aria-label="Settings"/)
  assert.match(bar, /data-processes-toggle/)
  assert.doesNotMatch(bar, />Plan</)
  assert.doesNotMatch(bar, />Workflow</)
  assert.doesNotMatch(bar, />Settings</)
  assert.doesNotMatch(bar, /class="lede"|data-plan-mode-chip|data-pending-count/)

  const introStart = html.indexOf('<div class="plan-intro">')
  assert.ok(introStart > barEnd)
  const intro = html.slice(introStart, html.indexOf('data-tab-panel="plan"'))
  assert.match(intro, /<p class="lede">POS-30 in review\.<\/p>/)
  assert.match(intro, /Mode <strong data-plan-mode-chip>watch<\/strong>/)
  assert.match(intro, /Agent <strong>claude-code<\/strong>/)
  assert.match(intro, /Iteration <strong>v1<\/strong>/)
  assert.match(intro, /Pending <strong data-pending-count>0<\/strong>/)
  assert.match(intro, /Workflow <strong>idle<\/strong>/)
})
