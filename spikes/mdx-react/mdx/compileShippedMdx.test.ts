import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Point } from '../../../client/execution-canvas/adapters/reactFlow/routeEdges.ts'
import { estimateWorkflowNodeSize } from '../../../src/workflowLayoutShared.ts'
import { createMdxComponents, PLAN_COMPONENT_NAMES } from './componentMap.ts'
import { compileShippedMdx } from './compileShippedMdx.ts'
import * as spike from './index.ts'
import { layoutPlanWorkflow, parseWorkflowDocument } from './layoutPlanWorkflow.ts'
import { renderMermaidSvg } from './Mermaid.tsx'

test('the component map names the plan primitives', async () => {
  const components = await createMdxComponents()
  for (const name of PLAN_COMPONENT_NAMES) {
    assert.equal(typeof components[name], 'function', name)
  }
  assert.equal(typeof components.Mermaid, 'function')
  assert.equal(typeof components.BarChart, 'function')
  assert.equal(typeof components.LineChart, 'function')
  assert.equal('evaluate' in spike, false)
  assert.equal('run' in spike, false)
})

test('compile accepts only mdx shipped in this folder', async () => {
  await assert.rejects(() => compileShippedMdx('../sample-plan.mdx'))
  await assert.rejects(() => compileShippedMdx('/etc/passwd'))
  await assert.rejects(() => compileShippedMdx('nested/../../package.json'))
  await assert.rejects(() => compileShippedMdx('package.json'))
  const Content = await compileShippedMdx('sample-plan.mdx')
  assert.equal(typeof Content, 'function')
})

test('the sample plan compiles CommonMark, a chart, mermaid, and a workflow', async () => {
  const Content = await compileShippedMdx('sample-plan.mdx')
  const components = await createMdxComponents()
  const html = renderToStaticMarkup(createElement(Content, { components }))
  assert.match(html, /<h1>Rate limiting rollout<\/h1>/)
  assert.match(html, /<strong>off<\/strong>/)
  assert.match(html, /<a href="#rollout-notes">rollout notes<\/a>/)
  assert.match(html, /<ul>/)
  assert.match(html, /<blockquote>/)
  assert.match(html, /class="vlp-phase"/)
  assert.match(html, /Confirm limiter design/)
  assert.match(html, /<legend>If Redis is unreachable, how should the limiter behave\?<\/legend>/)
  assert.match(html, /Fail open/)
  assert.match(html, /class="vlp-field"/)
  assert.match(html, /Weekly signups/)
  assert.match(html, /class="mermaid-diagram"/)
  assert.match(html, /Client --&gt; Gateway --&gt; Redis|Client --> Gateway --> Redis/)
  assert.doesNotMatch(html, /language-mermaid/)
  assert.match(html, /class="vlp-workflow"/)
  assert.match(html, /<path /)
  assert.match(html, /Choose fail mode/)
  assert.match(html, /retry/)
})

test('Pele draws a shipped mermaid figure', () => {
  const svg = renderMermaidSvg('flowchart LR\n  Client --> Gateway', 'mdx-diagram-test')
  assert.match(svg, /<svg/)
  assert.match(svg, /pele-/)
})

test('the sample workflow lays out without overlapping edges', async () => {
  const source = await readFile(new URL('./sample-plan.mdx', import.meta.url), 'utf8')
  const body = source.match(/```workflow\n([\s\S]*?)```/)?.[1]
  assert.ok(body)
  const spec = parseWorkflowDocument(body)
  const layout = layoutPlanWorkflow(spec.nodes, spec.edges)
  assert.equal(boxesOverlap(layout.nodes), false)

  const byId = new Map(layout.nodes.map((node) => [node.id, node]))
  const design = byId.get('design')
  const redis = byId.get('redis')
  const failMode = byId.get('fail-mode')
  const limits = byId.get('limits')
  const implement = byId.get('implement')
  const observe = byId.get('observe')
  assert.ok(design && redis && failMode && limits && implement && observe)
  assert.ok(design.x < redis.x)
  assert.ok(limits.x > redis.x)
  assert.ok(implement.x > limits.x)
  assert.ok(observe.x > implement.x)
  assert.ok(Math.abs(redis.x - failMode.x) < 1)
  assert.ok(Math.abs(redis.y - failMode.y) >= 40)
  const gap = redis.x - (design.x + estimateWorkflowNodeSize(design).width)
  assert.ok(gap >= 80, `gutter ${gap}`)

  const forward = layout.edges.filter((edge) => !edge.loop)
  assert.equal(forward.length, 6)
  for (const edge of forward) {
    assert.equal(segmentEntersAny(edge.points, layout.nodes), false, edge.id)
    assert.match(edge.path, /^M /)
  }
  const loop = layout.edges.find((edge) => edge.loop)
  assert.ok(loop)
  assert.match(loop.path, /^M /)
  assert.equal(loop.label, 'retry')
})

function boxesOverlap(
  nodes: Array<{ x: number; y: number; width: number; height: number }>,
): boolean {
  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      const a = nodes[left]
      const b = nodes[right]
      if (!a || !b) continue
      const separated =
        a.x + a.width <= b.x + 0.5 ||
        b.x + b.width <= a.x + 0.5 ||
        a.y + a.height <= b.y + 0.5 ||
        b.y + b.height <= a.y + 0.5
      if (!separated) return true
    }
  }
  return false
}

function segmentEntersAny(
  points: Point[],
  nodes: Array<{ x: number; y: number; width: number; height: number }>,
): boolean {
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    if (!from || !to) continue
    for (const node of nodes) {
      if (enters(from, to, node)) return true
    }
  }
  return false
}

function enters(
  from: Point,
  to: Point,
  node: { x: number; y: number; width: number; height: number },
): boolean {
  const left = node.x + 1
  const right = node.x + node.width - 1
  const top = node.y + 1
  const bottom = node.y + node.height - 1
  if (Math.abs(from.y - to.y) <= 0.5) {
    const y = (from.y + to.y) / 2
    if (y <= top || y >= bottom) return false
    return Math.max(from.x, to.x) > left && Math.min(from.x, to.x) < right
  }
  if (Math.abs(from.x - to.x) <= 0.5) {
    const x = (from.x + to.x) / 2
    if (x <= left || x >= right) return false
    return Math.max(from.y, to.y) > top && Math.min(from.y, to.y) < bottom
  }
  return false
}
