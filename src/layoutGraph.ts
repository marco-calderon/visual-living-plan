import type { ElkExtendedEdge, ElkNode } from 'elkjs'
import { layoutElkGraph } from './elkRuntime.node'
import {
  estimateWorkflowNodeSize,
  roundLayout,
  WORKFLOW_ELK_OPTIONS,
  type WorkflowLayoutEdge,
  type WorkflowLayoutNode,
  type WorkflowNodeSize,
} from './workflowLayoutShared'

export type {
  WorkflowLayoutEdge,
  WorkflowLayoutNode,
  WorkflowNodeSize,
} from './workflowLayoutShared'
export { estimateWorkflowNodeSize } from './workflowLayoutShared'

/**
 * Lay out a workflow the way the React Flow ELK example does: build a layered
 * graph with orthogonal edge routing, run ELK, then read top-left anchors.
 * Stored x/y are not kept. A fresh graph is built per call so a smaller diagram
 * does not keep nodes from a previous one.
 */
export function layoutWorkflowNodes<T extends WorkflowLayoutNode>(
  nodes: T[],
  edges: WorkflowLayoutEdge[],
  sizes?: ReadonlyMap<string, WorkflowNodeSize>,
): Array<T & { x: number; y: number }> {
  if (nodes.length === 0) return []

  const sizeById = new Map<string, WorkflowNodeSize>()
  const children: ElkNode[] = []
  for (const node of nodes) {
    const measured = sizes?.get(node.id)
    const size = {
      width: measured && measured.width > 0 ? measured.width : estimateWorkflowNodeSize(node).width,
      height: measured && measured.height > 0 ? measured.height : estimateWorkflowNodeSize(node).height,
    }
    sizeById.set(node.id, size)
    children.push({ id: node.id, width: size.width, height: size.height })
  }

  const elkEdges: ElkExtendedEdge[] = []
  edges.forEach((edge, index) => {
    if (edge.from === edge.to) return
    if (!sizeById.has(edge.from) || !sizeById.has(edge.to)) return
    elkEdges.push({
      id: `e${index}`,
      sources: [edge.from],
      targets: [edge.to],
    })
  })

  const laidOut = layoutElkGraph({
    id: 'root',
    layoutOptions: WORKFLOW_ELK_OPTIONS,
    children,
    edges: elkEdges,
  })

  const placedById = new Map((laidOut.children ?? []).map((child) => [child.id, child]))

  return nodes.map((node) => {
    const placed = placedById.get(node.id)
    const size = sizeById.get(node.id)
    if (!placed || typeof placed.x !== 'number' || typeof placed.y !== 'number' || !size) {
      return { ...node, x: node.x ?? 0, y: node.y ?? 0 }
    }
    return {
      ...node,
      x: roundLayout(placed.x),
      y: roundLayout(placed.y),
    }
  })
}
