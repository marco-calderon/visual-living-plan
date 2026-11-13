import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { accountInitials } from '../src/accountInitials.ts'
import type { ClientAssets } from '../src/assets.ts'
import { createIdleExecutionState } from '../src/execution.ts'
import { parsePlan } from '../src/parse.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const plan = parsePlan(
  `---
title: Toolbar edit
---

# Scope

Keep the account structure.
`,
  'toolbar-edit.plan.md',
)

function localPage(clientAssets: ClientAssets | null): string {
  return renderPlanPage({
    plan,
    mode: 'watch',
    responses: {},
    diffs: [],
    iteration: 1,
    pendingInteractionIds: [],
    execution: createIdleExecutionState(),
    clientAssets,
    theme: themePayload(defaultThemeConfig(), 'live-plan.config.json'),
  })
}

const assets: ClientAssets = {
  jsHref: '/assets/main.js',
  cssHrefs: [],
  mermaidHref: null,
  mermaidCssHrefs: [],
  highlightHref: null,
  highlightCssHrefs: [],
  selectorHref: null,
  selectorCssHrefs: [],
  planMdxHref: '/assets/planMdx.js',
  planMdxCssHrefs: [],
} as ClientAssets

function header(html: string): string {
  return html.slice(html.indexOf('<header class="titlebar">'), html.indexOf('</header>'))
}

test('the toolbar has no Edit button: the page itself is the editor (ADR 0040)', () => {
  assert.doesNotMatch(header(localPage(assets)), /data-plan-edit\b|plan-edit-btn/)
  assert.doesNotMatch(header(localPage(null)), /data-plan-edit\b|plan-edit-btn/)
  const shell = read('../src/PlanShell.tsx')
  assert.doesNotMatch(shell, /plan-edit-btn|data-plan-edit=""/)
  assert.doesNotMatch(read('../src/planPage.css'), /\.plan-edit-btn/)
})

test('the plan page edits blocks in place and applies them as a version', () => {
  const page = read('../client/planMdx.tsx')
  assert.match(page, /bindBlockEditButton\(/)
  assert.doesNotMatch(page, /bindPlanEditButton|LazyPlanEditor|PlanEditor\.tsx/)
  assert.match(page, /Apply changes/)
  assert.match(page, /data-plan-add-block/)
  const tools = read('../client/planEditButton.ts')
  assert.match(tools, /export const BLOCK_EDIT_KEY = 'E'/)
  assert.match(tools, /closest<HTMLElement>\('\[data-plan-block\]'\)/)
})

test('the toolbar keeps its controls as 36px icons on a phone', () => {
  const css = read('../src/planPage.css')
  const phone = css.slice(css.indexOf('.titlebar .titlebar-user-initials { display: none; }'))
  assert.match(phone, /@media \(max-width: 640px\) \{\s*\.titlebar \[data-versions-live="true"\],\s*\.titlebar \.titlebar-user:has\(\.titlebar-user-initials\) \{[^}]*width: 36px;/)
  // Dashboards mount the same account menu without the plan page's styles.
  for (const shared of [read('../src/hostToolbar.ts'), read('../src/hostToolbar.css')]) {
    assert.match(shared, /\.titlebar-user-initials \{ display: none; \}/)
  }
})

test('account initials take the first and last word, or the first letter of an email', () => {
  assert.equal(accountInitials('Margin Check'), 'MC')
  assert.equal(accountInitials('Ada King Lovelace'), 'AL')
  assert.equal(accountInitials('marco'), 'M')
  assert.equal(accountInitials('ada.lovelace@example.com'), 'A')
  assert.equal(accountInitials('  émile zola '), 'ÉZ')
  assert.equal(accountInitials(''), '?')
  assert.equal(accountInitials('—'), '?')
})
