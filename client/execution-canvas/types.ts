import type { ExecutionNodeStatus, ExecutionPortSide } from '../../src/execution.ts'

/** Library-agnostic model rendered by any execution-canvas adapter. */
export type ExecutionCanvasNode = {
  id: string
  label: string
  detail?: string
  status: ExecutionNodeStatus
  position: { x: number; y: number }
  /** Plan block this step corresponds to. */
  planRef?: string
  /** Title of that plan block. */
  planLabel?: string
}

export type ExecutionCanvasEdge = {
  id: string
  source: string
  target: string
  label?: string
  sourceSide?: ExecutionPortSide
  targetSide?: ExecutionPortSide
}

export type ExecutionCanvasModel = {
  nodes: ExecutionCanvasNode[]
  edges: ExecutionCanvasEdge[]
  /**
   * Optional adapter-specific extras (viewport, custom RF fields, etc.).
   * Adapters should ignore unknown keys so graphs stay portable.
   */
  scene?: Record<string, unknown>
}

export type ExecutionCanvasProps = {
  model: ExecutionCanvasModel
  /** When true, the human can pan/zoom but not edit the graph. */
  readonly?: boolean
  /** Called when a step that points at a plan section is selected. */
  onSelectPlanRef?: (planRef: string) => void
}
