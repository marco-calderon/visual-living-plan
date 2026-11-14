import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { run } from '@mdx-js/mdx'
import { createElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as runtime from 'react/jsx-runtime'
import { compilePlanMdx } from '../src/planMdx/compilePlanMdx.ts'
import { MarkdownTable } from '../client/mdx/MarkdownTable.tsx'
import { MarkdownTaskCheckbox } from '../client/mdx/MarkdownTaskCheckbox.tsx'
import { createIdleExecutionState } from '../src/execution.ts'
import { planSourceFlags, planSourceToMdx, renderPlanStaticHtml } from '../src/planMdx/source.ts'
import { parsePlan } from '../src/parse.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'

const rateLimit = readFileSync(new URL('../examples/rate-limit.plan.md', import.meta.url), 'utf8')

test('a plan file becomes MDX the sample components can compile', async () => {
  const mdx = planSourceToMdx(rateLimit)
  assert.match(mdx, /<phase id="design"/)
  assert.match(mdx, /<callout id="redis-dependency"/)
  assert.match(mdx, /<choice id="fail-mode"/)
  assert.match(mdx, /<option id="open" label="Fail open">/)
  assert.match(mdx, /<form id="limits"/)
  assert.match(mdx, /<field name="max_rps"/)
  assert.match(mdx, /<workflow id="rollout"/)
  assert.doesNotMatch(mdx, /\{%/)
  await compilePlanMdx(mdx)
})

test('pipe tables compile to tables and keep inline markdown in cells', async () => {
  const source = `| Name | Count | Note |
| --- | ---: | :---: |
| **Ada** | \`3\` | [docs](https://example.com) |
| b \`\\|\` az | \`foo \\| bar\` | kept |
`
  const file = await compilePlanMdx(source)
  const loaded = await run(String(file), { ...runtime })
  const Content = loaded.default as (props: { components: { table: typeof MarkdownTable } }) => ReactElement
  const html = renderToStaticMarkup(createElement(Content, { components: { table: MarkdownTable } }))
  assert.match(html, /class="rich-table"/)
  // A cell carries the place of its text (data-plan-cell-range), so a click edits it where it is.
  assert.match(html, /<th data-plan-cell-range="\d+-\d+">Name<\/th>/)
  assert.match(html, /text-align:right/)
  assert.match(html, /text-align:center/)
  assert.match(html, /<strong>Ada<\/strong>/)
  assert.match(html, /<code>3<\/code>/)
  assert.match(html, /href="https:\/\/example.com"/)
  assert.match(html, /<code>\|<\/code>/)
  assert.match(html, /<code>foo \| bar<\/code>/)
  assert.doesNotMatch(html, /\| --- \|/)
})

test('task list items compile to read-only checkboxes in place of [ ] and [x]', async () => {
  const source = `- [ ] Write the migration
- [x] Review the schema
- Plain item
`
  const file = await compilePlanMdx(source)
  const loaded = await run(String(file), { ...runtime })
  const Content = loaded.default as (props: { components: { input: typeof MarkdownTaskCheckbox } }) => ReactElement
  const html = renderToStaticMarkup(createElement(Content, { components: { input: MarkdownTaskCheckbox } }))
  assert.match(html, /<ul class="contains-task-list"[^>]*>/)
  assert.equal(html.match(/<li class="task-list-item">/g)?.length, 2)
  assert.match(html, /role="checkbox" aria-checked="false" aria-readonly="true" class="plan-checkbox-control plan-task-checkbox" data-unchecked=""><\/span> Write the migration/)
  assert.match(html, /role="checkbox" aria-checked="true"[^>]*data-checked=""><span class="plan-checkbox-indicator"><svg[^]*?<\/span><\/span> Review the schema/)
  assert.match(html, /<li>Plain item<\/li>/)
  assert.doesNotMatch(html, /\[ \]|\[x\]|<input/)
})

function Passthrough({ children }: { children?: ReactNode }) {
  return children
}

test('pipe tables inside a phase and a callout stay tables', async () => {
  const source = readFileSync(new URL('../examples/tables.plan.md', import.meta.url), 'utf8')
  const file = await compilePlanMdx(planSourceToMdx(source))
  const loaded = await run(String(file), { ...runtime })
  const Content = loaded.default as (props: { components: Record<string, unknown> }) => ReactElement
  const html = renderToStaticMarkup(
    createElement(Content, {
      components: { table: MarkdownTable, phase: Passthrough, callout: Passthrough, workflow: Passthrough },
    }),
  )
  assert.match(html, /<th[^>]*>Status<\/th><th[^>]*>Meaning<\/th>/)
  assert.match(html, /<code>PENDING<\/code>/)
  assert.match(html, /<th[^>]*>Column<\/th><th[^>]*>Purpose<\/th>/)
  assert.match(html, /<code>google_ads_operation_id<\/code>/)
  assert.match(html, /<th>Producer<\/th><th>When<\/th>/)
  assert.equal(html.match(/class="rich-table"/g)?.length, 3)
  assert.doesNotMatch(html, /\| --- \|/)
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
