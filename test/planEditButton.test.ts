import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { accountInitials } from '../src/accountInitials.ts'
import type { ClientAssets } from '../src/assets.ts'
import { createIdleExecutionState } from '../src/execution.ts'
import { parsePlan } from '../src/parse.ts'
import { PLAN_EDIT_KEY, planEditButtonHtml, planEditTitle } from '../src/planEditButton.ts'
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

test('the Edit button names itself by its visible label and the E key', () => {
  const html = planEditButtonHtml()
  assert.match(html, /^<button type="button" class="plan-edit-btn" data-plan-edit aria-keyshortcuts="E">/)
  assert.match(html, /<span class="plan-edit-label">Edit<\/span><span class="plan-edit-draft">Resume draft<\/span><\/button>$/)
  assert.doesNotMatch(html, /aria-label/)
  assert.equal(PLAN_EDIT_KEY, 'E')
  assert.equal(planEditTitle({ editing: false, hasDraft: false }), 'Edit this plan (E)')
  assert.equal(planEditTitle({ editing: false, hasDraft: true }), 'Continue the unpublished edit saved on this device (E)')
  assert.match(planEditTitle({ editing: true, hasDraft: true }), /^Close the editor/)
})

test('a local plan has Edit in the toolbar, after the tabs, once the plan can render in the browser', () => {
  const bar = header(localPage(assets))
  const tabs = bar.indexOf('data-tab-target="settings"')
  const edit = bar.indexOf('data-plan-edit')
  const processes = bar.indexOf('data-processes-root')
  assert.ok(tabs > 0 && edit > tabs && processes > edit, `order tabs ${tabs}, edit ${edit}, processes ${processes}`)
  // The server-rendered plan has no editor to open.
  assert.doesNotMatch(header(localPage(null)), /data-plan-edit/)
})

test('the hosted toolbar draws Edit between the tabs and the versions menu, only where the plan can be edited', () => {
  const shell = read('../src/PlanShell.tsx')
  const tabs = shell.indexOf('data-tab-target="workflow"')
  const edit = shell.indexOf('data-plan-edit=""')
  const versions = shell.indexOf('data-plan-versions=""')
  assert.ok(tabs > 0 && edit > tabs && versions > edit, `order tabs ${tabs}, edit ${edit}, versions ${versions}`)
  assert.match(shell, /const canEdit = !version && \(host === 'local' \|\| owner\)/)
  assert.match(shell, /\{canEdit \? \(\s*<button type="button" className="plan-edit-btn" data-plan-edit=""/)
})

test('the Edit button left the plan column', () => {
  assert.doesNotMatch(read('../client/planMdx.tsx'), /plan-edit-toggle|PencilLine/)
  assert.doesNotMatch(read('../client/entries/primitives.css'), /\.plan-edit-toggle/)
  assert.match(read('../client/planMdx.tsx'), /bindPlanEditButton\(/)
})

test('the toolbar keeps its controls as 36px icons on a phone', () => {
  const css = read('../src/planPage.css')
  assert.match(css, /\.plan-edit-btn \{[^}]*height: 36px;/)
  assert.match(css, /body:not\(\[data-plan-editable\]\) \.plan-edit-btn \{ visibility: hidden; \}/)
  assert.match(css, /body\[data-plan-editable="false"\] \.plan-edit-btn \{ display: none; \}/)
  assert.match(css, /\.plan-edit-btn\[aria-pressed="true"\] \{[^}]*background: var\(--accent-fill\);/)
  const phone = css.slice(css.indexOf('.titlebar .titlebar-user-initials { display: none; }'))
  assert.match(phone, /@media \(max-width: 640px\) \{\s*\.plan-edit-btn,\s*\.titlebar \[data-versions-live="true"\],\s*\.titlebar \.titlebar-user:has\(\.titlebar-user-initials\) \{[^}]*width: 36px;/)
  // The label stays the accessible name: clipped, not removed.
  assert.match(phone, /\.plan-edit-btn :is\(\.plan-edit-label, \.plan-edit-draft\) \{[^}]*clip: rect\(0 0 0 0\);/)
  assert.doesNotMatch(phone.slice(0, phone.indexOf('.plan-edit-btn[data-plan-has-draft]::after')), /\.plan-edit-label[^{]*\{[^}]*display: none/)
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
