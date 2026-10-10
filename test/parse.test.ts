import assert from 'node:assert/strict'
import test from 'node:test'
import { createIdleExecutionState } from '../src/execution.ts'
import { parsePlan } from '../src/parse.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'

test('mermaid fences in plan markdown become diagram hosts', () => {
  const plan = parsePlan(`# Demo

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

\`\`\`ts
const n = 1
\`\`\`
`)

  const markdown = plan.blocks.find((block) => block.type === 'markdown')
  assert.ok(markdown && markdown.type === 'markdown')
  assert.match(markdown.html, /class="mermaid-diagram"/)
  assert.match(markdown.html, /<pre class="mermaid">flowchart LR\n {2}A --&gt; B<\/pre>/)
  assert.match(markdown.html, /data-lang="ts"/)
  assert.doesNotMatch(markdown.html, /data-lang="mermaid"/)
  assert.equal(
    plan.blocks.some((block) => block.type === 'workflow'),
    false,
  )
})

test('mermaid fences inside a phase body stay inside that phase', () => {
  const plan = parsePlan(`\`\`\`phase
id: design
title: Design
status: active
body: |
  Request path:

  \`\`\`mermaid
  flowchart LR
    Gateway --> Redis
  \`\`\`
\`\`\`
`)

  assert.equal(plan.blocks.length, 1)
  const phase = plan.blocks[0]
  assert.ok(phase && phase.type === 'phase')
  assert.match(phase.bodyHtml, /class="mermaid-diagram"/)
  assert.match(phase.bodyHtml, /Gateway --&gt; Redis/)
})

test('the plan page loads the mermaid client only when a diagram is present', () => {
  const theme = themePayload(defaultThemeConfig(), 'live-plan.config.json')
  const clientAssets = {
    jsHref: '/client/assets/main.js',
    cssHrefs: [],
    mermaidHref: '/client/assets/mermaid.js',
    mermaidCssHrefs: ['/client/assets/mermaid.css'],
  }
  const withDiagram = parsePlan('```mermaid\nflowchart LR\n  A --> B\n```\n')
  const withoutDiagram = parsePlan('# Notes\n\nNo diagram here.\n')

  const diagramHtml = renderPlanPage({
    plan: withDiagram,
    mode: 'watch',
    responses: {},
    diffs: [],
    iteration: 1,
    pendingInteractionIds: [],
    execution: createIdleExecutionState(),
    clientAssets,
    theme,
  })
  const plainHtml = renderPlanPage({
    plan: withoutDiagram,
    mode: 'watch',
    responses: {},
    diffs: [],
    iteration: 1,
    pendingInteractionIds: [],
    execution: createIdleExecutionState(),
    clientAssets,
    theme,
  })

  assert.match(diagramHtml, /src="\/client\/assets\/mermaid\.js"/)
  assert.match(diagramHtml, /href="\/client\/assets\/mermaid\.css"/)
  assert.doesNotMatch(plainHtml, /mermaid\.js/)
  assert.doesNotMatch(plainHtml, /mermaid\.css/)
})
