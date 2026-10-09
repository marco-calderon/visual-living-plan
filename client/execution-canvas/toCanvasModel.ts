import type { ExecutionGraph, ExecutionState } from '../../src/execution.ts'
import type { ExecutionCanvasModel } from './types.ts'

export function graphToCanvasModel(
  graph: ExecutionGraph,
  scene?: Record<string, unknown>,
): ExecutionCanvasModel {
  const nodes = graph.nodes.map((node, index) => ({
    id: node.id,
    label: node.label,
    detail: node.detail,
    status: node.status ?? 'pending',
    position: {
      x: node.x ?? (index % 3) * 260,
      y: node.y ?? Math.floor(index / 3) * 160,
    },
  }))

  const edges = (graph.edges ?? []).map((edge, index) => ({
    id: `e-${edge.from}-${edge.to}-${index}`,
    source: edge.from,
    target: edge.to,
    label: edge.label,
  }))

  return { nodes, edges, scene }
}

export function executionToCanvasModel(execution: ExecutionState): ExecutionCanvasModel | null {
  if (execution.graph) {
    return graphToCanvasModel(execution.graph, execution.scene)
  }

  if (execution.scene?.nodes && Array.isArray(execution.scene.nodes)) {
    return {
      nodes: execution.scene.nodes as ExecutionCanvasModel['nodes'],
      edges: Array.isArray(execution.scene.edges)
        ? (execution.scene.edges as ExecutionCanvasModel['edges'])
        : [],
      scene: execution.scene,
    }
  }

  return null
}
