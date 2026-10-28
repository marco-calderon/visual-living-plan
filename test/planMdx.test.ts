import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { compileSync } from '@mdx-js/mdx'
import { createIdleExecutionState } from '../src/execution.ts'
import { planSourceFlags, planSourceToMdx, renderPlanStaticHtml } from '../src/planMdx/source.ts'
import { parsePlan } from '../src/parse.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'
import { recmaPlanComponents } from '../client/mdx/recmaPlanComponents.ts'
import { remarkMermaid } from '../client/mdx/remarkMermaid.ts'

const rateLimit = readFileSync(new URL('../examples/rate-limit.plan.md', import.meta.url), 'utf8')

test('a plan file becomes MDX the sample components can compile', () => {
  const mdx = planSourceToMdx(rateLimit)
  assert.match(mdx, /<phase id="design"/)
  assert.match(mdx, /<callout id="redis-dependency"/)
  assert.match(mdx, /<choice id="fail-mode"/)
  assert.match(mdx, /<option id="open" label="Fail open">/)
  assert.match(mdx, /<form id="limits"/)
  assert.match(mdx, /<field name="max_rps"/)
  assert.match(mdx, /<workflow id="rollout"/)
  assert.doesNotMatch(mdx, /\{%/)
  compileSync(mdx, {
    jsx: false,
    jsxImportSource: 'react',
    jsxRuntime: 'automatic',
    outputFormat: 'function-body',
    format: 'mdx',
    development: false,
    remarkPlugins: [remarkMermaid],
    recmaPlugins: [recmaPlanComponents],
  })
})

test('markdoc tags and entry fences are not the authoring contract', () => {
  assert.throws(() =>
    planSourceToMdx(`{% callout id="redis" kind="risk" title="Redis dependency" %}
A Redis outage must not take down the API.
{% /callout %}
`),
  )
  assert.throws(() => parsePlan('```phase\nid: design\ntitle: Design\nstatus: active\n```\n'))
  assert.throws(() =>
    parsePlan(`<phase id="design" title="Design" status="active">
\`\`\`workflow
design | Design | design
\`\`\`
</phase>
`),
  )
})

test('the plan page mounts the MDX app and keeps a static column for the bundle-less page', () => {
  const plan = parsePlan(rateLimit, 'examples/rate-limit.plan.md')
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
  assert.match(html, /id="plan-mdx-root"/)
  assert.match(html, /id="living-plan-mdx"/)
  assert.match(html, /id="plan-design"/)
  assert.match(html, /<a class="workflow-step" href="#plan-design" data-plan-jump="design"/)
  assert.doesNotMatch(html, /planMdx/)
  assert.equal(planSourceFlags(rateLimit).mermaid, true)
  assert.equal(planSourceFlags(rateLimit).code, true)
  const flags = planSourceFlags('```mermaid\nflowchart LR\n  A --> B\n```\n')
  assert.equal(flags.mermaid, true)
  assert.equal(flags.code, false)
  const code = renderPlanStaticHtml('```ts\nconst n = 1\n```\n')
  assert.match(code, /class="code-block"/)
  assert.match(code, /data-lang="ts"/)
})
