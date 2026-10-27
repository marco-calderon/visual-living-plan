import assert from 'node:assert/strict'
import test from 'node:test'
import {
  portPoint,
  routeWorkflowEdges,
  type Point,
  type RoutedEdgeInput,
  type RoutedNode,
} from '../client/execution-canvas/adapters/reactFlow/routeEdges.ts'
import { graphToCanvasModel } from '../client/execution-canvas/toCanvasModel.ts'
import graph from '../examples/execution-graph.json'
import type { ExecutionGraph } from '../src/execution.ts'
import {
  estimateWorkflowNodeSize,
  layoutWorkflowNodes,
  type WorkflowLayoutNode,
} from '../src/layoutGraph.ts'
import { parsePlan } from '../src/parse.ts'
import { planToExpectedGraph } from '../src/workflow.ts'

test('a straight chain is one left-to-right row', () => {
  const nodes = chain(['design', 'redis', 'fail-mode', 'limits'])
  const laidOut = layoutWorkflowNodes(nodes, linkChain(nodes))
  const xs = laidOut.map((node) => node.x ?? 0)
  const ys = laidOut.map((node) => node.y ?? 0)
  for (let index = 1; index < xs.length; index += 1) {
    assert.ok((xs[index] ?? 0) > (xs[index - 1] ?? 0), `x ${index}`)
  }
  assert.ok(Math.max(...ys) - Math.min(...ys) < 1)
  assert.equal(overlapCount(laidOut), 0)
  const gap = (laidOut[1]?.x ?? 0) - ((laidOut[0]?.x ?? 0) + estimateWorkflowNodeSize(nodes[0]!).width)
  assert.ok(gap >= 80, `gutter ${gap}`)
})

test('fan-in stacks sources and places the join to the right', () => {
  const sources = ['roles', 'table', 'notes', 'catalog'].map((id) => ({ id, label: labelFor(id) }))
  const join = { id: 'registry', label: 'Registry and settings' }
  const laidOut = layoutWorkflowNodes(
    [...sources, join],
    sources.map((source) => ({ from: source.id, to: join.id })),
  )
  const byId = new Map(laidOut.map((node) => [node.id, node]))
  const sourceNodes = sources.map((source) => byId.get(source.id))
  const target = byId.get(join.id)
  assert.ok(target)
  for (const source of sourceNodes) {
    assert.ok(source)
    assert.ok((source.x ?? 0) + estimateWorkflowNodeSize(source).width < (target.x ?? 0))
  }
  const sourceXs = sourceNodes.map((node) => node?.x ?? 0)
  assert.ok(Math.max(...sourceXs) - Math.min(...sourceXs) < 1)
  const sourceYs = sourceNodes.map((node) => node?.y ?? 0).sort((left, right) => left - right)
  for (let index = 1; index < sourceYs.length; index += 1) {
    assert.ok((sourceYs[index] ?? 0) - (sourceYs[index - 1] ?? 0) >= 40)
  }
  assert.equal(overlapCount(laidOut), 0)
})

test('a long chain stays wide instead of wrapping back to the first column', () => {
  const nodes = chain([
    'design',
    'redis',
    'fail-mode',
    'limits',
    'notes',
    'approve',
    'implement',
    'observe',
    'done',
  ])
  const laidOut = layoutWorkflowNodes(nodes, linkChain(nodes))
  const xs = laidOut.map((node) => node.x ?? 0)
  for (let index = 1; index < xs.length; index += 1) {
    assert.ok((xs[index] ?? 0) > (xs[index - 1] ?? 0) + 200, `wrapped at ${index}`)
  }
  assert.equal(overlapCount(laidOut), 0)
})

test('stored coordinates and self-loops do not keep the manual grid', () => {
  const nodes = chain(['design', 'implement', 'observe']).map((node) => ({ ...node, x: 0, y: 0 }))
  const laidOut = layoutWorkflowNodes(nodes, [
    { from: 'design', to: 'implement' },
    { from: 'implement', to: 'implement' },
    { from: 'implement', to: 'observe' },
  ])
  assert.ok((laidOut[0]?.x ?? 0) < (laidOut[1]?.x ?? 0))
  assert.ok((laidOut[1]?.x ?? 0) < (laidOut[2]?.x ?? 0))
  assert.equal(overlapCount(laidOut), 0)
})

test('a planned workflow uses the dagre positions', () => {
  const plan = parsePlan(`---
title: Wide
---

\`\`\`workflow
id: wide
title: Wide row
nodes:
  - id: design
    label: Confirm limiter design
    x: 10
    y: 10
  - id: redis
    label: Redis dependency
    x: 10
    y: 10
  - id: fail-mode
    label: Choose fail mode
    x: 10
    y: 10
  - id: limits
    label: Set production limits
    x: 10
    y: 10
edges:
  - from: design
    to: redis
  - from: redis
    to: fail-mode
  - from: fail-mode
    to: limits
\`\`\`
`)
  const expected = planToExpectedGraph(plan)
  assert.ok(expected)
  const xs = expected.nodes.map((node) => node.x ?? 0)
  for (let index = 1; index < xs.length; index += 1) {
    assert.ok((xs[index] ?? 0) > (xs[index - 1] ?? 0))
  }
})

test('the sample loop and a fan-in stay clear of the cards after routing', () => {
  const sample = graphToCanvasModel(graph as ExecutionGraph)
  assert.equal(boxesOverlap(sample.nodes.map((node) => ({ ...node, x: node.position.x, y: node.position.y }))), false)

  const sources = ['roles', 'table', 'notes', 'catalog'].map((id) => ({ id, label: labelFor(id) }))
  const join = { id: 'registry', label: 'Registry and settings' }
  const done = { id: 'done', label: 'Definition of done' }
  const spec = [...sources, join, done]
  const laidOut = layoutWorkflowNodes(spec, [
    ...sources.map((source) => ({ from: source.id, to: join.id })),
    { from: join.id, to: done.id },
  ])
  const routed = toRouted(laidOut)
  const edges: RoutedEdgeInput[] = [
    ...sources.map((source) => link(source.id, routed, join.id)),
    link(join.id, routed, done.id),
  ]
  const routes = routeWorkflowEdges(routed, edges)
  const exits = new Set<number>()
  for (const route of routes) {
    assert.equal(segmentEntersAny(route.points, routed), false, route.id)
    assert.ok(route.path.startsWith('M '), route.id)
    const start = route.points[0]
    assert.ok(start)
    exits.add(Math.round(start.y))
  }
  assert.equal(exits.size, edges.length)
})

function chain(ids: string[]): WorkflowLayoutNode[] {
  return ids.map((id) => ({ id, label: labelFor(id) }))
}

function labelFor(id: string): string {
  const labels: Record<string, string> = {
    design: 'Confirm limiter design',
    redis: 'Redis dependency',
    'fail-mode': 'Choose fail mode',
    limits: 'Set production limits',
    notes: 'Rollout notes',
    approve: 'Approval to implement',
    implement: 'Implement gateway middleware',
    observe: 'Ship dashboards and alerts',
    done: 'Definition of done',
    roles: 'Roles export',
    table: 'Table and migration',
    catalog: 'Permission catalog',
    registry: 'Registry and settings',
  }
  return labels[id] ?? id
}

function linkChain(nodes: WorkflowLayoutNode[]): Array<{ from: string; to: string }> {
  return nodes.slice(1).map((node, index) => ({
    from: nodes[index]?.id ?? node.id,
    to: node.id,
  }))
}

function overlapCount(nodes: WorkflowLayoutNode[]): number {
  return boxesOverlap(nodes) ? 1 : 0
}

function boxesOverlap(nodes: WorkflowLayoutNode[]): boolean {
  const boxes = nodes.map((node) => {
    const size = estimateWorkflowNodeSize(node)
    return { x: node.x ?? 0, y: node.y ?? 0, width: size.width, height: size.height }
  })
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left]
      const b = boxes[right]
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

function toRouted(nodes: WorkflowLayoutNode[]): RoutedNode[] {
  return nodes.map((node) => {
    const size = estimateWorkflowNodeSize(node)
    return { id: node.id, x: node.x ?? 0, y: node.y ?? 0, width: size.width, height: size.height }
  })
}

function link(sourceId: string, nodes: RoutedNode[], targetId: string): RoutedEdgeInput {
  const source = nodes.find((node) => node.id === sourceId)
  const target = nodes.find((node) => node.id === targetId)
  assert.ok(source && target)
  return {
    id: sourceId,
    source: sourceId,
    target: targetId,
    sourceSide: 'right',
    targetSide: 'left',
    sourcePoint: portPoint(source, 'right', 'source'),
    targetPoint: portPoint(target, 'left', 'target'),
  }
}

function segmentEntersAny(points: Point[], nodes: RoutedNode[]): boolean {
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

function enters(from: Point, to: Point, node: RoutedNode): boolean {
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
