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
  assert.match(html, /\.titlebar\s*\{[^}]*background:\s*var\(--surface\);/)
  assert.match(html, /\.titlebar\s*\{[^}]*border-bottom:\s*1px solid var\(--hairline\);/)
  assert.doesNotMatch(html, /\.titlebar\s*\{[^}]*backdrop-filter/)
  assert.match(html, /\.brand\s*\{[^}]*font-weight:\s*600;/)
  assert.match(html, /\.brand\s*\{[^}]*font-family:\s*var\(--font-display\);/)
  assert.match(html, /\.plan-card\s*\{[^}]*box-shadow:\s*var\(--shadow\);/)
  assert.doesNotMatch(html, /\.plan-card\s*\{[^}]*backdrop-filter/)
  assert.doesNotMatch(html, /\.plan-card\s*\{[^}]*0 18px 50px/)
  assert.match(html, /\.plan-card\s*\{[^}]*transform-origin:\s*top left;/)
  assert.match(html, /\.plan-card\s*\{[^}]*opacity 200ms var\(--ease-out\)/)
  assert.match(html, /\.plan-card\s*\{[^}]*transform 200ms var\(--ease-out\)/)
  assert.match(html, /\.plan-card\[data-open\]\s*\{[^}]*scale\(1\)/)
  assert.match(html, /\.plan-card\[data-closed\]\s*\{[^}]*scale\(0\.95\)/)
  assert.match(html, /--ease-out:\s*cubic-bezier\(0\.23, 1, 0\.32, 1\)/)
  assert.match(html, /setAttribute\('data-closed', ''\)/)
  assert.match(html, /addEventListener\('transitionend', planDetailsCloseListener\)/)
  assert.match(html, /propertyName !== 'opacity'/)
  assert.match(html, /setTimeout\(finishPlanDetailsClose, 280\)/)
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
  assert.match(bar, /data-file-version[^>]*aria-label="Version · v1"/)
  assert.match(bar, /data-file-version-value>v1</)
  assert.doesNotMatch(bar, /Iteration ·/)
  assert.doesNotMatch(bar, /<button[^>]*data-file-version/)
  assert.match(html, /planDetailsBtn\.addEventListener\('mouseenter'/)
  assert.match(bar, /data-pending-fact[^>]*hidden/)
  assert.match(bar, /data-pending-count>0</)
  assert.match(bar, /data-pending-badge[^>]*hidden/)
  assert.match(bar, /data-workflow="idle"/)
  assert.match(bar, /data-review-chip[^>]*hidden/)
  assert.doesNotMatch(bar, />Mode |Agent <strong|Version <strong|Pending <strong|Workflow <strong/)
  assert.doesNotMatch(html, /<h2>Snapshots<\/h2>/)
  assert.doesNotMatch(html, /plan-snapshots/)

  assert.match(html, /data-layout="default"/)
  assert.doesNotMatch(html, /data-page-width="narrow"/)
  assert.match(html, /data-page-width="default"/)
  assert.match(html, /data-page-width="wide"/)
  assert.match(html, /data-page-width="full"/)
  assert.match(html, /aria-checked="true">Default</)
  assert.match(html, /Full uses the available width/)
  assert.match(html, /overflow-x:\s*clip/)
  assert.match(html, /--page-column:\s*720px/)
  assert.doesNotMatch(html, /--page-column:\s*560px/)
  assert.match(html, /--page-column:\s*1120px/)
  assert.match(html, /--page-column:\s*100%/)
  assert.match(html, /--shell-width:\s*min\(var\(--page-column\)/)
  assert.match(html, /#plan-mdx-root/)
  assert.match(html, /\.rich-table[\s\S]*?overflow-x:\s*auto/)
  assert.match(html, /\.rich-table :is\(th, td\) \*\s*\{[^}]*white-space:\s*nowrap/)
  assert.match(html, /class="layout-default"/)

  const wide = page(themePayload({ ...defaultThemeConfig(), pageWidth: 'wide' }, 'live-plan.config.json'))
  assert.match(wide, /data-layout="wide"/)
  assert.match(wide, /class="layout-wide"/)
  assert.match(wide, /data-page-width="wide"[^>]*aria-checked="true"/)

  const full = page(themePayload({ ...defaultThemeConfig(), pageWidth: 'full' }, 'live-plan.config.json'))
  assert.match(full, /data-layout="full"/)
  assert.match(full, /class="layout-full"/)
  assert.match(full, /data-page-width="full"[^>]*aria-checked="true"/)
})

test('settings can turn code wrapping on', () => {
  const off = page()
  assert.match(off, /data-wrap-code="false"/)
  assert.match(off, /id="code-wrap-label">Wrap text in code</)
  assert.match(off, /data-code-wrap[\s\S]*?aria-checked="false"/)
  assert.match(off, /theme\.wrapCode/)
  assert.match(off, /html\[data-wrap-code="true"\] \.code-block:not\(\.mermaid\):not\(\.mermaid-fallback\)/)
  assert.match(off, /:root\[data-theme="dark"\] \.plan-switch/)
  assert.match(off, /function applyWrapCode/)

  const on = page(themePayload({ ...defaultThemeConfig(), wrapCode: true }, 'live-plan.config.json'))
  assert.match(on, /data-wrap-code="true"/)
  assert.match(on, /data-code-wrap[\s\S]*?aria-checked="true"/)
  assert.match(on, /plan-switch-thumb" data-checked=""/)
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

test('the description card shows the file version and not a snapshot list', () => {
  const html = page(undefined, {
    iteration: 9,
    mdxHeadSnapshotId: 'snap_b',
    mdxSnapshots: [
      {
        id: 'snap_a',
        documentId: 'plan',
        seq: 1,
        parentId: null,
        title: 'POS-22',
        body: 'a',
        reason: 'create',
        restoredFromId: null,
        createdAt: 1,
      },
      {
        id: 'snap_b',
        documentId: 'plan',
        seq: 4,
        parentId: 'snap_a',
        title: 'POS-22',
        body: 'b',
        reason: 'edit',
        restoredFromId: null,
        createdAt: 2,
      },
    ],
  })
  const bar = header(html)
  assert.match(bar, /data-file-version[^>]*aria-label="Version · v4"/)
  assert.match(bar, /data-file-version-value>v4</)
  assert.doesNotMatch(bar, /Iteration · v9/)
  assert.doesNotMatch(bar, /<button[^>]*data-file-version/)
  assert.doesNotMatch(html, /<h2>Snapshots<\/h2>/)
  assert.doesNotMatch(html, /plan-snapshots/)
})
