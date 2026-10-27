import type { ExecutionGraph, ExecutionPortSide, ExecutionState } from '../../src/execution.ts'
import { layoutWorkflowNodes } from '../../src/layoutGraph.ts'
import type { ExecutionCanvasModel } from './types.ts'

const PORT_SIDES = new Set<ExecutionPortSide>(['top', 'right', 'bottom', 'left'])

function portSide(value: ExecutionPortSide | undefined, fallback: ExecutionPortSide): ExecutionPortSide {
  return value && PORT_SIDES.has(value) ? value : fallback
}

export function graphToCanvasModel(
  graph: ExecutionGraph,
  scene?: Record<string, unknown>,
): ExecutionCanvasModel {
  const laidOut = layoutWorkflowNodes(graph.nodes, graph.edges ?? [])
  const nodes = laidOut.map((node) => ({
    id: node.id,
    label: node.label,
    detail: node.detail,
    status: node.status ?? 'pending',
    planRef: node.planRef,
    planLabel: node.planLabel,
    position: {
      x: node.x ?? 0,
      y: node.y ?? 0,
    },
  }))

  const edges = (graph.edges ?? []).map((edge, index) => ({
    id: `e-${edge.from}-${edge.to}-${index}`,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    sourceSide: portSide(edge.fromSide, 'right'),
    targetSide: portSide(edge.toSide, 'left'),
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
