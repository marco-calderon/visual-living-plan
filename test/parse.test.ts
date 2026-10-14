import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createIdleExecutionState } from '../src/execution.ts'
import { parsePlan } from '../src/parse.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'
import { workflowRequirementError } from '../src/workflow.ts'

test('rendered plan parts carry a stable comment target', () => {
  const plan = parsePlan(`# Demo

A paragraph of context.

- First item

\`\`\`phase
id: design
title: Design
status: active
body: |
  Request path.
\`\`\`
`)
  const markdown = plan.blocks.find((block) => block.type === 'markdown')
  assert.ok(markdown && markdown.type === 'markdown')
  assert.match(markdown.html, /data-plan-part="markdown:0\/heading:1"/)
  assert.match(markdown.html, /data-plan-kind="heading"/)
  assert.match(markdown.html, /data-plan-part="markdown:0\/paragraph:1"/)
  assert.match(markdown.html, /data-plan-part="markdown:0\/list-item:1"/)

  const phase = plan.blocks.find((block) => block.type === 'phase')
  assert.ok(phase && phase.type === 'phase')
  assert.match(phase.bodyHtml, /data-plan-part="phase:design\/paragraph:1"/)
})

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

test('pipe tables render as tables', () => {
  const plan = parsePlan(`# Demo

| Name | Count |
| --- | ---: |
| **Ada** | \`3\` |
| <b> | 4 |

After.
`)
  const markdown = plan.blocks.find((block) => block.type === 'markdown')
  assert.ok(markdown && markdown.type === 'markdown')
  assert.equal(
    markdown.html,
    [
      '<h1 data-plan-part="markdown:0/heading:1" data-plan-kind="heading">Demo</h1>',
      '<div class="rich-table"><table><thead><tr><th>Name</th><th class="align-right">Count</th></tr></thead><tbody><tr><td><strong>Ada</strong></td><td class="align-right"><code>3</code></td></tr><tr><td>&lt;b&gt;</td><td class="align-right">4</td></tr></tbody></table></div>',
      '<p data-plan-part="markdown:0/paragraph:1" data-plan-kind="paragraph">After.</p>',
    ].join('\n'),
  )
})

test('table columns follow the separator alignment', () => {
  const plan = parsePlan(`| abc | defghi |
:-: | -----------:
bar | baz
`)
  const markdown = plan.blocks.find((block) => block.type === 'markdown')
  assert.ok(markdown && markdown.type === 'markdown')
  assert.equal(
    markdown.html,
    '<div class="rich-table"><table><thead><tr><th class="align-center">abc</th><th class="align-right">defghi</th></tr></thead><tbody><tr><td class="align-center">bar</td><td class="align-right">baz</td></tr></tbody></table></div>',
  )
})

test('escaped pipes and pipes inside code stay in the cell', () => {
  const plan = parsePlan(`| Call | Note |
| --- | --- |
| b \`\\|\` az | \`foo | bar\` |
| f\\|oo | kept |
`)
  const markdown = plan.blocks.find((block) => block.type === 'markdown')
  assert.ok(markdown && markdown.type === 'markdown')
  assert.equal(
    markdown.html,
    '<div class="rich-table"><table><thead><tr><th>Call</th><th>Note</th></tr></thead><tbody><tr><td>b <code>|</code> az</td><td><code>foo | bar</code></td></tr><tr><td>f|oo</td><td>kept</td></tr></tbody></table></div>',
  )
})

test('a table ends at a blank line and pads short rows', () => {
  const plan = parsePlan(`| abc | def |
| --- | --- |
| bar | baz |
bar
| bar | baz | boo |

Next
`)
  const markdown = plan.blocks.find((block) => block.type === 'markdown')
  assert.ok(markdown && markdown.type === 'markdown')
  assert.equal(
    markdown.html,
    [
      '<div class="rich-table"><table><thead><tr><th>abc</th><th>def</th></tr></thead><tbody><tr><td>bar</td><td>baz</td></tr><tr><td>bar</td><td></td></tr><tr><td>bar</td><td>baz</td></tr></tbody></table></div>',
      '<p data-plan-part="markdown:0/paragraph:1" data-plan-kind="paragraph">Next</p>',
    ].join('\n'),
  )
})

test('a header without a matching separator stays a paragraph', () => {
  const plan = parsePlan(`| abc | def |
| --- |
| bar |
`)
  const markdown = plan.blocks.find((block) => block.type === 'markdown')
  assert.ok(markdown && markdown.type === 'markdown')
  assert.equal(
    markdown.html,
    '<p data-plan-part="markdown:0/paragraph:1" data-plan-kind="paragraph">| abc | def | | --- | | bar |</p>',
  )
})

test('a header-only table has no body', () => {
  const plan = parsePlan(`| abc | def |
| --- | --- |
`)
  const markdown = plan.blocks.find((block) => block.type === 'markdown')
  assert.ok(markdown && markdown.type === 'markdown')
  assert.equal(
    markdown.html,
    '<div class="rich-table"><table><thead><tr><th>abc</th><th>def</th></tr></thead></table></div>',
  )
})

test('a table inside a phase body stays inside that phase', () => {
  const plan = parsePlan(`\`\`\`phase
id: design
title: Design
status: active
body: |
  | Step | State |
  | --- | :---: |
  | Parse | done |
\`\`\`
`)
  assert.equal(plan.blocks.length, 1)
  const phase = plan.blocks[0]
  assert.ok(phase && phase.type === 'phase')
  assert.equal(
    phase.bodyHtml,
    '<div class="rich-table"><table><thead><tr><th>Step</th><th class="align-center">State</th></tr></thead><tbody><tr><td>Parse</td><td class="align-center">done</td></tr></tbody></table></div>',
  )
})

test('the table showcase renders tables in the plan, a phase, and a callout', () => {
  const plan = parsePlan(readFileSync(new URL('../examples/tables.plan.md', import.meta.url), 'utf8'))
  const markdown = plan.blocks.find((block) => block.type === 'markdown')
  const phase = plan.blocks.find((block) => block.type === 'phase' && block.id === 'queue')
  const callout = plan.blocks.find((block) => block.type === 'callout')
  assert.ok(markdown && markdown.type === 'markdown')
  assert.ok(phase && phase.type === 'phase')
  assert.ok(callout && callout.type === 'callout')
  assert.match(markdown.html, /<th>Status<\/th><th>Meaning<\/th><th class="align-right">Lease<\/th>/)
  assert.match(phase.bodyHtml, /<th>Column<\/th><th>Purpose<\/th>/)
  assert.match(phase.bodyHtml, /<code>google_ads_operation_id<\/code>/)
  assert.match(phase.bodyHtml, /<li[^>]*><code>enqueue\(db, operations\)<\/code>/)
  assert.doesNotMatch(phase.bodyHtml, /\| --- \|/)
  assert.match(callout.bodyHtml, /<th>Producer<\/th><th>When<\/th>/)
  assert.match(callout.bodyHtml, /<td>COE<\/td><td>now<\/td>/)
})

test('a following block ends the table', () => {
  const plan = parsePlan(`| A | B |
| --- | --- |
| 1 | 2 |
## Next

\`\`\`ts
const n = 1
\`\`\`
`)
  const markdown = plan.blocks.find((block) => block.type === 'markdown')
  assert.ok(markdown && markdown.type === 'markdown')
  assert.match(
    markdown.html,
    /^<div class="rich-table"><table><thead><tr><th>A<\/th><th>B<\/th><\/tr><\/thead><tbody><tr><td>1<\/td><td>2<\/td><\/tr><\/tbody><\/table><\/div>\n<h2 data-plan-part="markdown:0\/heading:1" data-plan-kind="heading">Next<\/h2>\n<pre class="code-block" data-plan-part="markdown:0\/code:1" data-plan-kind="code"/,
  )
})
