export type ExecutionNodeStatus = 'pending' | 'active' | 'done' | 'failed'

export type ExecutionGraphNode = {
  id: string
  label: string
  detail?: string
  status?: ExecutionNodeStatus
  x?: number
  y?: number
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
}

export function createIdleExecutionState(): ExecutionState {
  return {
    active: false,
  }
}
