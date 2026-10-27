import dagre from '@dagrejs/dagre'
import type { GraphLabel, NodeLabel } from '@dagrejs/dagre'

export type WorkflowLayoutNode = {
  id: string
  label: string
  detail?: string
  planRef?: string
  planLabel?: string
  x?: number
  y?: number
}

export type WorkflowLayoutEdge = {
  from: string
  to: string
}

export type WorkflowNodeSize = {
  width: number
  height: number
}

/**
 * Cards are at most 240px wide. Rank separation is the horizontal gutter
 * between ranks. The edge router needs that gutter wider than a smooth-step
 * corner, and wide enough that fan-in rails can sit side by side.
 */
const CARD_WIDTH = 240
const RANK_SEP = 120
const NODE_SEP = 48

export function estimateWorkflowNodeSize(node: {
  label: string
  detail?: string
  planRef?: string
  planLabel?: string
}): WorkflowNodeSize {
  const labelLines = Math.max(1, Math.ceil(node.label.length / 22))
  const detailLines = node.detail ? Math.max(1, Math.ceil(node.detail.length / 28)) : 0
  const reference = node.planLabel ?? node.planRef
  const referenceLines = reference ? Math.max(1, Math.ceil(`Plan · ${reference}`.length / 28)) : 0
  let height = 28
  height += 20
  height += labelLines * 22
  if (detailLines > 0) height += 8 + detailLines * 20
  if (referenceLines > 0) height += 10 + referenceLines * 16
  return { width: CARD_WIDTH, height }
}

/**
 * Lay out a workflow the way the React Flow Dagre example does: build a
 * graph, run dagre, then shift each center anchor to the top-left anchor
 * React Flow uses. Stored x/y are not kept. A fresh graph is built per call
 * so a smaller diagram does not keep nodes from a previous one.
 */
export function layoutWorkflowNodes<T extends WorkflowLayoutNode>(
  nodes: T[],
  edges: WorkflowLayoutEdge[],
  sizes?: ReadonlyMap<string, WorkflowNodeSize>,
): Array<T & { x: number; y: number }> {
  if (nodes.length === 0) return []

  const graph = new dagre.graphlib.Graph<GraphLabel, NodeLabel>({ multigraph: true })
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: 'LR', nodesep: NODE_SEP, ranksep: RANK_SEP })

  const sizeById = new Map<string, WorkflowNodeSize>()
  for (const node of nodes) {
    const measured = sizes?.get(node.id)
    const size = {
      width: measured && measured.width > 0 ? measured.width : estimateWorkflowNodeSize(node).width,
      height: measured && measured.height > 0 ? measured.height : estimateWorkflowNodeSize(node).height,
    }
    sizeById.set(node.id, size)
    graph.setNode(node.id, { width: size.width, height: size.height })
  }

  edges.forEach((edge, index) => {
    if (edge.from === edge.to) return
    if (!sizeById.has(edge.from) || !sizeById.has(edge.to)) return
    graph.setEdge(edge.from, edge.to, {}, `e${index}`)
  })

  dagre.layout(graph)

  return nodes.map((node) => {
    const placed = graph.node(node.id)
    const size = sizeById.get(node.id)
    if (!placed || typeof placed.x !== 'number' || typeof placed.y !== 'number' || !size) {
      return { ...node, x: node.x ?? 0, y: node.y ?? 0 }
    }
    return {
      ...node,
      x: round(placed.x - size.width / 2),
      y: round(placed.y - size.height / 2),
    }
  })
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
