import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createIdleExecutionState } from '../src/execution.ts'
import { parsePlan } from '../src/parse.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'

const SPACE_SCALE = [
  ['--space-xxs', '4px'],
  ['--space-xs', '8px'],
  ['--space-sm', '12px'],
  ['--space-md', '16px'],
  ['--space-lg', '20px'],
  ['--space-xl', '24px'],
  ['--space-xxl', '32px'],
  ['--space-xxxl', '40px'],
  ['--space-section-sm', '48px'],
  ['--space-section', '64px'],
  ['--space-section-lg', '80px'],
  ['--space-hero', '96px'],
] as const

function pageCss(): string {
  const plan = parsePlan(
    `---
title: Spacing
---

# Hi
`,
    'spacing.plan.md',
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

function assertSpaceScale(css: string): void {
  for (const [token, value] of SPACE_SCALE) {
    assert.match(css, new RegExp(`${token}:\\s*${value}`))
  }
  assert.equal(css.match(/--space-xl:\s*24px/g)?.length, 1)
}

test('documentation cards use the space scale in both color schemes', () => {
  const css = pageCss()
  const dark = css.split(':root[data-theme="dark"]')[1] ?? ''
  const darkBlock = dark.slice(0, dark.indexOf('}'))
  assert.ok(darkBlock)
  assertSpaceScale(css)
  assert.doesNotMatch(darkBlock, /--space-/)
  assert.match(css, /--canvas:\s*#ffffff/)
  assert.match(dark, /--canvas:\s*#0c0c0e/)
  assert.match(css, /\.block\s*\{[^}]*border:\s*1px solid var\(--hairline\)/)
  assert.match(css, /\.block\s*\{[^}]*padding:\s*var\(--space-xl\)/)
  assert.match(css, /\.plan-document > :is\(\.plan-entry[^)]*\)[\s\S]*?margin-top:\s*var\(--space-xl\)/)
  assert.match(css, /\.vlp-stack,\s*\.vlp-box\s*\{[^}]*gap:\s*var\(--space-xl\)/)
  assert.match(css, /\.titlebar\s*\{/)
  assert.match(css, /\.plan-card\s*\{[^}]*box-shadow:\s*var\(--shadow\)/)
})

test('plan component stacks use the same scale, not a one-off gap', () => {
  const css = readFileSync(new URL('../client/entries/primitives.css', import.meta.url), 'utf8')
  assertSpaceScale(css)
  assert.match(css, /\[data-gap="xs"\] \{ gap: var\(--space-xs\); \}/)
  assert.match(css, /\[data-gap="sm"\] \{ gap: var\(--space-sm\); \}/)
  assert.match(css, /\[data-gap="md"\] \{ gap: var\(--space-md\); \}/)
  assert.match(css, /\[data-gap="lg"\] \{ gap: var\(--space-lg\); \}/)
  assert.doesNotMatch(css, /gap:\s*0\.35rem|gap:\s*0\.55rem|gap:\s*0\.9rem|gap:\s*1\.25rem/)
  assert.match(css, /\.plan-panel,\s*\.plan-box\[data-surface="panel"\]\s*\{[^}]*padding:\s*var\(--space-xl\)/)
  assert.match(css, /\.plan-popover\s*\{[^}]*box-shadow:\s*var\(--shadow\)/)
  assert.match(css, /\.vlp-workflow-edge\s*\{[^}]*fill:\s*none/)
})
