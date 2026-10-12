import assert from 'node:assert/strict'
import test from 'node:test'
import { createIdleExecutionState } from '../src/execution.ts'
import { parsePlan } from '../src/parse.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'
import { workflowRequirementError } from '../src/workflow.ts'

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

test('a plan requires a workflow block', () => {
  const missing = parsePlan('# Demo\n\nNo execution path yet.\n')
  assert.equal(
    workflowRequirementError(missing),
    'A plan requires a workflow block. That block is the execution path.',
  )

  const empty = parsePlan('```workflow\nnodes: []\nedges: []\n```\n')
  assert.equal(
    workflowRequirementError(empty),
    'A plan requires a workflow block. That block is the execution path.',
  )

  const ready = parsePlan('```workflow\nnodes:\n  - id: design\n    label: Design\nedges: []\n```\n')
  assert.equal(workflowRequirementError(ready), undefined)
})

test('the plan page loads the mermaid client only when a diagram is present', () => {
  const theme = themePayload(defaultThemeConfig(), 'live-plan.config.json')
  const clientAssets = {
    jsHref: '/client/assets/main.js',
    cssHrefs: [],
    mermaidHref: '/client/assets/mermaid.js',
    mermaidCssHrefs: ['/client/assets/mermaid.css'],
    highlightHref: '/client/assets/highlight.js',
    highlightCssHrefs: ['/client/assets/highlight.css'],
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
  assert.doesNotMatch(diagramHtml, /highlight\.js/)
  assert.doesNotMatch(plainHtml, /mermaid\.js/)
  assert.doesNotMatch(plainHtml, /mermaid\.css/)
  assert.doesNotMatch(plainHtml, /highlight\.js/)
})

test('a code fence can start line numbers at a chosen line', () => {
  const plan = parsePlan('```ts start=40\nconst n = 1\n```\n')
  const markdown = plan.blocks.find((block) => block.type === 'markdown')
  assert.ok(markdown && markdown.type === 'markdown')
  assert.match(markdown.html, /data-lang="ts"/)
  assert.match(markdown.html, /data-start="40"/)
  assert.doesNotMatch(markdown.html, /start=40/)

  const plain = parsePlan('```ts\nconst n = 1\n```\n')
  const plainMarkdown = plain.blocks.find((block) => block.type === 'markdown')
  assert.ok(plainMarkdown && plainMarkdown.type === 'markdown')
  assert.doesNotMatch(plainMarkdown.html, /data-start=/)
})

test('a diff fence is marked for hunk rendering', () => {
  const plan = parsePlan('```diff\n--- a/gate.ts\n+++ b/gate.ts\n@@ -1 +1 @@\n-a\n+b\n```\n')
  const markdown = plan.blocks.find((block) => block.type === 'markdown')
  assert.ok(markdown && markdown.type === 'markdown')
  assert.match(markdown.html, /class="code-block"/)
  assert.match(markdown.html, /data-diff="true"/)
  assert.doesNotMatch(markdown.html, /data-lang=/)
  assert.doesNotMatch(markdown.html, /data-start=/)

  const typed = parsePlan('```ts diff\n@@ -1 +1 @@\n-a\n+b\n```\n')
  const typedMarkdown = typed.blocks.find((block) => block.type === 'markdown')
  assert.ok(typedMarkdown && typedMarkdown.type === 'markdown')
  assert.match(typedMarkdown.html, /data-lang="ts"/)
  assert.match(typedMarkdown.html, /data-diff="true"/)

  const patch = parsePlan('```patch start=40\n@@ -1 +1 @@\n-a\n+b\n```\n')
  const patchMarkdown = patch.blocks.find((block) => block.type === 'markdown')
  assert.ok(patchMarkdown && patchMarkdown.type === 'markdown')
  assert.match(patchMarkdown.html, /data-diff="true"/)
  assert.doesNotMatch(patchMarkdown.html, /data-start=/)
  assert.doesNotMatch(patchMarkdown.html, /data-lang=/)
})

test('the plan page loads the highlighter only when a code block is present', () => {
  const theme = themePayload(defaultThemeConfig(), 'live-plan.config.json')
  const clientAssets = {
    jsHref: '/client/assets/main.js',
    cssHrefs: [],
    mermaidHref: '/client/assets/mermaid.js',
    mermaidCssHrefs: [],
    highlightHref: '/client/assets/highlight.js',
    highlightCssHrefs: ['/client/assets/highlight.css'],
  }
  const withCode = parsePlan('```ts\nconst n = 1\n```\n')
  const withoutCode = parsePlan('# Notes\n\nPlain prose.\n')

  const codeHtml = renderPlanPage({
    plan: withCode,
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
    plan: withoutCode,
    mode: 'watch',
    responses: {},
    diffs: [],
    iteration: 1,
    pendingInteractionIds: [],
    execution: createIdleExecutionState(),
    clientAssets,
    theme,
  })

  assert.match(codeHtml, /class="code-block"/)
  assert.match(codeHtml, /data-lang="ts"/)
  assert.match(codeHtml, /src="\/client\/assets\/highlight\.js"/)
  assert.match(codeHtml, /href="\/client\/assets\/highlight\.css"/)
  assert.doesNotMatch(codeHtml, /mermaid\.js/)
  assert.doesNotMatch(plainHtml, /highlight\.js/)
  assert.doesNotMatch(plainHtml, /highlight\.css/)
})
