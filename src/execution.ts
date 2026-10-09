export type ExecutionNodeStatus = 'pending' | 'active' | 'done' | 'failed' | 'blocked'

export type ExecutionGraphNode = {
  id: string
  label: string
  detail?: string
  status?: ExecutionNodeStatus
  x?: number
  y?: number
  /** Plan block id this step jumps to. */
  planRef?: string
  /** Title of that plan block, shown as the on-node reference. */
  planLabel?: string
}

export type ExecutionPortSide = 'top' | 'right' | 'bottom' | 'left'

export type ExecutionGraphEdge = {
  from: string
  to: string
  /** Shown on the edge. Self-loops (`from` === `to`) render this on the arc. */
  label?: string
  /** Side of the source card the edge leaves. Defaults to `right`. */
  fromSide?: ExecutionPortSide
  /** Side of the target card the edge enters. Defaults to `left`. */
  toSide?: ExecutionPortSide
}

/** Portable agent-facing graph. Adapters map this into their native model. */
export type ExecutionGraph = {
  title?: string
  nodes: ExecutionGraphNode[]
  edges?: ExecutionGraphEdge[]
}

export type ExecutionState = {
  active: boolean
  step?: string
  detail?: string
  updatedAt?: number
  /** Preferred portable payload for every adapter. */
  graph?: ExecutionGraph
  /**
   * Optional adapter-specific extras (viewport hints, custom fields).
   * Prefer `graph` for cross-library portability.
   */
  scene?: Record<string, unknown>
  /**
   * Expected workflow taken from the plan. Present before execution starts
   * so the Workflow tab can render the plan's own diagram.
   */
  planned?: ExecutionGraph
}

export function createIdleExecutionState(): ExecutionState {
  return {
    active: false,
  }
}

function edgeKey(edge: ExecutionGraphEdge): string {
  return `${edge.from}\0${edge.to}`
}

/**
 * Keep the plan's expected workflow, then overlay a live execution graph.
 * Matching ids update status and copy. Steps that exist only on one side stay visible.
 */
export function mergePlannedExecution(
  planned: ExecutionGraph | undefined,
  live: ExecutionGraph | undefined,
): ExecutionGraph | undefined {
  if (!planned || planned.nodes.length === 0) return live
  if (!live || live.nodes.length === 0) return planned

  const liveById = new Map(live.nodes.map((node) => [node.id, node]))
  const seen = new Set<string>()
  const nodes: ExecutionGraphNode[] = planned.nodes.map((node) => {
    seen.add(node.id)
    const overlay = liveById.get(node.id)
    if (!overlay) return node
    return {
      ...node,
      label: node.label || overlay.label,
      detail: overlay.detail ?? node.detail,
      status: overlay.status ?? node.status,
      x: node.x ?? overlay.x,
      y: node.y ?? overlay.y,
      planRef: overlay.planRef ?? node.planRef,
      planLabel: node.planLabel ?? overlay.planLabel,
    }
  })

  const plannedRight = planned.nodes.reduce((max, node) => Math.max(max, node.x ?? 0), 0)
  let extraIndex = 0
  for (const node of live.nodes) {
    if (seen.has(node.id)) continue
    const linked = planned.nodes.find(
      (entry) => entry.id === node.id || entry.planRef === node.id,
    )
    nodes.push({
      ...node,
      x: plannedRight + 300,
      y: extraIndex * 168,
      planRef: node.planRef ?? linked?.planRef,
      planLabel: node.planLabel ?? linked?.planLabel,
    })
    extraIndex += 1
  }

  const liveEdgeByKey = new Map((live.edges ?? []).map((edge) => [edgeKey(edge), edge]))
  const edges: ExecutionGraphEdge[] = (planned.edges ?? []).map((edge) => {
    const overlay = liveEdgeByKey.get(edgeKey(edge))
    if (!overlay) return edge
    return {
      ...edge,
      label: overlay.label ?? edge.label,
      fromSide: overlay.fromSide ?? edge.fromSide,
      toSide: overlay.toSide ?? edge.toSide,
    }
  })
  const keys = new Set(edges.map(edgeKey))
  for (const edge of live.edges ?? []) {
    const key = edgeKey(edge)
    if (keys.has(key)) continue
    edges.push(edge)
    keys.add(key)
  }

  return {
    title: planned.title ?? live.title,
    nodes,
    edges,
  }
}
