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

function renderSource(source: string, diffs: Array<{ index: number; status: 'added' | 'edited' | 'removed' | 'unchanged' }> = []) {
  return renderPlanPage({
    plan: parsePlan(source),
    mode: 'watch',
    responses: {},
    diffs,
    iteration: 1,
    pendingInteractionIds: [],
    execution: createIdleExecutionState(),
    clientAssets: null,
    theme: themePayload(defaultThemeConfig(), 'live-plan.config.json'),
  })
}

function stack(html: string): string {
  const start = html.indexOf('<main class="stack">')
  const end = html.indexOf('</main>', start)
  return html.slice(start, end)
}

test('a heading-only chunk renders inside the following card', () => {
  const html = stack(renderSource(`## What I found before planning

\`\`\`callout
kind: note
title: Facts
body: |
  The note body.
\`\`\`
`))

  assert.equal(html.match(/class="block callout/g)?.length, 1)
  assert.equal(html.includes('class="block markdown'), false)
  const callout = html.slice(html.indexOf('class="block callout'))
  assert.match(callout, /<h2>What I found before planning<\/h2>/)
  assert.match(callout, /The note body\./)
})

test('a diagram-only chunk renders inside the previous card', () => {
  const html = stack(renderSource(`\`\`\`callout
kind: note
title: Facts
body: |
  The note body.
\`\`\`

\`\`\`mermaid
flowchart LR
  heading[Heading chunk] --> note[Note card]
\`\`\`
`))

  assert.equal(html.match(/class="block callout/g)?.length, 1)
  assert.equal(html.includes('class="block markdown'), false)
  const callout = html.slice(html.indexOf('class="block callout'), html.lastIndexOf('</section>') + '</section>'.length)
  assert.match(callout, /class="mermaid-diagram"/)
  assert.match(callout, /The note body\./)
})

test('choices and questions stay separate cards', () => {
  const html = stack(renderSource(`## Before the choice

\`\`\`choice
id: sink
prompt: Add the override?
options:
  - id: yes
    label: Add it
  - id: no
    label: Omit it
\`\`\`

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

\`\`\`choice
id: drift
prompt: Where does the check run?
options:
  - id: jenkins
    label: Jenkins
  - id: dag
    label: The DAG
\`\`\`

\`\`\`questions
id: one
prompt: First
items:
  - One?
\`\`\`

\`\`\`questions
id: two
prompt: Second
items:
  - Two?
\`\`\`
`))

  assert.equal(html.match(/class="block interaction choice/g)?.length, 2)
  assert.equal(html.match(/class="block interaction questions/g)?.length, 2)
  assert.equal(html.includes('class="block markdown'), false)
  const firstChoice = html.slice(html.indexOf('data-interaction-id="sink"'), html.indexOf('data-interaction-id="drift"'))
  assert.match(firstChoice, /<h2>Before the choice<\/h2>/)
  assert.match(firstChoice, /class="mermaid-diagram"/)
})

test('a run of phases shares one card and a single phase stays one card', () => {
  const grouped = stack(renderSource(`\`\`\`phase
id: group
title: Attach
status: pending
body: |
  First step.
\`\`\`

\`\`\`phase
id: wrap
title: Wrap
status: pending
body: |
  Second step.
\`\`\`

\`\`\`phase
id: prove
title: Prove
status: pending
body: |
  Third step.
\`\`\`

\`\`\`callout
kind: note
body: |
  Split.
\`\`\`

\`\`\`phase
id: alone
title: Alone
status: active
body: |
  Just this step.
\`\`\`
`))

  assert.equal(grouped.match(/class="block phase-group"/g)?.length, 1)
  assert.equal(grouped.match(/data-plan-ref="group"/g)?.length, 1)
  assert.equal(grouped.match(/data-plan-ref="wrap"/g)?.length, 1)
  assert.equal(grouped.match(/data-plan-ref="prove"/g)?.length, 1)
  assert.equal(grouped.match(/class="block phase status-/g)?.length, 1)
  assert.match(grouped, /data-plan-ref="alone"/)
  const group = grouped.slice(grouped.indexOf('class="block phase-group"'), grouped.indexOf('class="block callout'))
  assert.equal(group.match(/class="phase status-/g)?.length, 3)
})

test('mixed markdown stays one card and a phase body keeps its diagram', () => {
  const mixed = stack(renderSource(`Intro paragraph.

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`
`))
  assert.equal(mixed.match(/class="block markdown/g)?.length, 1)
  assert.match(mixed, /class="mermaid-diagram"/)

  const phase = stack(renderSource(`\`\`\`phase
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
`))
  assert.equal(phase.match(/class="block phase status-/g)?.length, 1)
  assert.equal(phase.includes('class="block markdown'), false)
  assert.match(phase, /Gateway --&gt; Redis/)
})

test('a lone document title that repeats the hero is dropped', () => {
  const html = stack(renderSource('---\ntitle: Test plan\n---\n\n# Test plan\n'))
  assert.equal(html.includes('class="block markdown'), false)
  assert.equal(html.includes('<h1>Test plan</h1>'), false)
})

test('a moved heading keeps its own diff class', () => {
  const html = stack(
    renderSource(
      `## What I found before planning

\`\`\`callout
kind: note
body: |
  Facts.
\`\`\`
`,
      [
        { index: 0, status: 'added' },
        { index: 1, status: 'unchanged' },
      ],
    ),
  )
  assert.match(html, /class="card-preface rich diff-added"/)
  assert.match(html, /class="block callout kind-note diff-unchanged"/)
})
