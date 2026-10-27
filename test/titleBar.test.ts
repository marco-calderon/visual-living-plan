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

function page(
  theme?: Parameters<typeof renderPlanPage>[0]['theme'],
  extras: Partial<Parameters<typeof renderPlanPage>[0]> = {},
): string {
  return renderPlanPage({
    plan,
    mode: 'watch',
    responses: {},
    diffs: [],
    iteration: 1,
    pendingInteractionIds: [],
    execution: createIdleExecutionState(),
    clientAssets: null,
    theme: theme ?? themePayload(defaultThemeConfig(), 'live-plan.config.json'),
    ...extras,
  })
}

function header(html: string): string {
  const barStart = html.indexOf('<header class="titlebar">')
  const barEnd = html.indexOf('</header>')
  assert.ok(barStart >= 0 && barEnd > barStart)
  return html.slice(barStart, barEnd)
}

test('the logo opens a card; the title sits on the solid bar', () => {
  const html = page()
  const bar = header(html)
  const shell = html.indexOf('<div class="shell">')
  const logoAt = bar.indexOf('class="titlebar-logo"')
  const titleAt = bar.indexOf('<h1 class="brand" id="plan-title">')
  const toolsAt = bar.indexOf('class="chrome-tools"')
  const cardAt = bar.indexOf('data-plan-card')

  assert.match(html, /--titlebar-offset:\s*3\.75rem;/)
  assert.match(html, /\.titlebar\s*\{[^}]*height:\s*var\(--titlebar-offset\);/)
  assert.match(html, /\.titlebar\s*\{[^}]*background:\s*var\(--panel-strong\);/)
  assert.match(html, /\.titlebar\s*\{[^}]*border-bottom:\s*1px solid var\(--line\);/)
  assert.match(html, /\.titlebar\s*\{[^}]*backdrop-filter:\s*blur\(16px\);/)
  assert.match(html, /\.brand\s*\{[^}]*font-size:\s*1\.45rem;/)
  assert.match(html, /\.plan-card\s*\{[^}]*transform-origin:\s*top left;/)
  assert.match(html, /\.plan-card\[data-open\]\s*\{[^}]*processes-panel-in 280ms cubic-bezier\(0\.22, 1, 0\.36, 1\) both/)
  assert.match(html, /\.plan-card\[data-closed\]\s*\{[^}]*processes-panel-out 240ms ease both/)
  assert.match(html, /setAttribute\('data-closed', ''\)/)
  assert.match(html, /addEventListener\('animationend', planDetailsCloseListener\)/)
  assert.match(html, /setTimeout\(finishPlanDetailsClose, 320\)/)
  assert.doesNotMatch(html, /\.titlebar\s*\{[^}]*background:\s*none/)
  assert.doesNotMatch(html, /\.plan-card \.brand/)

  assert.match(bar, /data-plan-details-toggle/)
  assert.match(bar, /aria-expanded="false"/)
  assert.match(bar, /aria-label="Plan details"/)
  assert.match(bar, /class="titlebar-logo" src="\/favicon.png"/)
  assert.match(bar, /data-plan-card[^>]*hidden/)
  assert.match(bar, /<h1 class="brand" id="plan-title">POS-22 Google Ads scripts migration \(AI-DLC\)<\/h1>/)
  assert.ok(logoAt >= 0 && cardAt > logoAt && titleAt > cardAt && toolsAt > titleAt)
  assert.ok(bar.lastIndexOf('</div>', titleAt) < titleAt)
  assert.doesNotMatch(bar.slice(cardAt, bar.lastIndexOf('</div>', titleAt)), /<h1 /)
  assert.match(bar, /<p class="lede">POS-30 in review\.<\/p>/)
  assert.match(bar, /aria-label="Plan"/)
  assert.match(bar, /aria-label="Workflow"/)
  assert.match(bar, /aria-label="Settings"/)
  assert.match(bar, /data-processes-toggle/)
  assert.doesNotMatch(bar, />Plan</)
  assert.doesNotMatch(bar, />Workflow</)
  assert.doesNotMatch(bar, />Settings</)
  assert.doesNotMatch(html, /class="plan-intro"/)
  assert.ok(html.indexOf('class="lede"') < shell)
  assert.ok(html.indexOf('data-plan-mode-chip') < shell)

  assert.match(bar, /data-plan-mode-chip[^>]*data-mode="watch"/)
  assert.match(bar, /data-plan-mode-value>watch</)
  assert.match(bar, /aria-label="Agent · claude-code"/)
  assert.match(bar, />claude-code</)
  assert.match(bar, /aria-label="Iteration · v1"/)
  assert.match(bar, />v1</)
  assert.match(bar, /data-pending-fact[^>]*hidden/)
  assert.match(bar, /data-pending-count>0</)
  assert.match(bar, /data-pending-badge[^>]*hidden/)
  assert.match(bar, /data-workflow="idle"/)
  assert.match(bar, /data-review-chip[^>]*hidden/)
  assert.doesNotMatch(bar, />Mode |Agent <strong|Iteration <strong|Pending <strong|Workflow <strong/)

  assert.match(html, /data-layout="centered"/)
  assert.match(html, /id="layout-full-width"/)
  assert.match(html, /overflow-x:\s*clip/)
  assert.match(html, /--shell-width:\s*min\(920px/)

  const full = page(themePayload({ ...defaultThemeConfig(), fullWidth: true }, 'live-plan.config.json'))
  assert.match(full, /data-layout="full"/)
  assert.match(full, /class="[^"]*layout-full/)
})

test('pending, review, and changed sections use icons and the logo badge', () => {
  const html = page(undefined, {
    mode: 'review',
    pendingInteractionIds: ['a', 'b'],
    reviewDecision: 'approve',
    diffs: [{ index: 0, status: 'edited' }],
  })
  const bar = header(html)
  assert.match(bar, /aria-label="Plan details, 2 pending"/)
  assert.match(bar, /data-mode="review"/)
  assert.match(bar, /data-pending-count>2</)
  assert.doesNotMatch(bar, /data-pending-fact[^>]*hidden/)
  assert.doesNotMatch(bar, /data-pending-badge[^>]*hidden/)
  assert.match(bar, /data-review-chip[^>]*data-decision="approve"/)
  assert.match(bar, /data-review-value>approve</)
  assert.doesNotMatch(bar, /data-review-chip[^>]*hidden/)
  assert.match(bar, /aria-label="Changed · 1"/)
  assert.match(bar, /data-review-icon="deny"/)
  assert.match(bar, /data-review-icon="iterate"/)
})
