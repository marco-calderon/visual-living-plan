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

export type ExecutionAction = 'start' | 'push' | 'stop'

/** Fields an agent may send with `execution start`, `push`, or `stop`. */
export type ExecutionPatch = Partial<Pick<ExecutionState, 'step' | 'detail' | 'graph' | 'scene'>>

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? value : undefined
}

/** The fields of a request body that `applyExecutionChange` reads. Anything else is dropped. */
export function readExecutionPatch(body: unknown): ExecutionPatch {
  if (!body || typeof body !== 'object') return {}
  const record = body as Record<string, unknown>
  const patch: ExecutionPatch = {}
  const step = text(record.step)
  const detail = text(record.detail)
  if (step) patch.step = step
  if (detail) patch.detail = detail
  if (record.graph && typeof record.graph === 'object') patch.graph = record.graph as ExecutionGraph
  if (record.scene && typeof record.scene === 'object') patch.scene = record.scene as Record<string, unknown>
  return patch
}

/**
 * The run after an agent's start, push, or stop, worked out on the host so the agent does not
 * have to read the run first. Fields the agent leaves out keep their current value.
 *
 * - `start` turns the run on.
 * - `push` updates the run and leaves it on or off as it is.
 * - `stop` turns the run off and keeps the last step and graph on the Workflow tab.
 */
export function applyExecutionChange(
  current: ExecutionState | null | undefined,
  action: ExecutionAction,
  patch: ExecutionPatch = {},
): ExecutionState {
  const previous = current ?? createIdleExecutionState()
  const active = action === 'start' ? true : action === 'stop' ? false : Boolean(previous.active)
  return {
    active,
    step: patch.step ?? previous.step ?? (action === 'start' ? 'Executing' : undefined),
    detail: patch.detail ?? previous.detail,
    graph: patch.graph ?? previous.graph,
    scene: patch.scene ?? previous.scene,
  }
}

const STATUS_RANK: Record<ExecutionNodeStatus, number> = {
  pending: 0,
  failed: 1,
  blocked: 2,
  active: 3,
  done: 4,
}

/** The further along of two statuses, so a run never moves a plan step backwards. */
export function furthestStatus(
  left: ExecutionNodeStatus | undefined,
  right: ExecutionNodeStatus | undefined,
): ExecutionNodeStatus | undefined {
  if (!left) return right
  if (!right) return left
  return STATUS_RANK[right] > STATUS_RANK[left] ? right : left
}

function edgeKey(edge: ExecutionGraphEdge): string {
  return `${edge.from}\0${edge.to}`
}

/**
 * Keep the plan's expected workflow, then overlay a live execution graph.
 * Matching ids update status and copy. Steps that exist only on one side stay visible.
 * A step linked to the plan keeps the further along of its plan status and its run status,
 * the same rule plan progress uses, so the diagram and the progress agree.
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
      status: node.planRef ? furthestStatus(node.status, overlay.status) : (overlay.status ?? node.status),
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
