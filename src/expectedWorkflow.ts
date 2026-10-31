import type { ExecutionGraph, ExecutionGraphEdge, ExecutionGraphNode, ExecutionNodeStatus, ExecutionPortSide } from './execution'
import {
  entryAnchor,
  entryInAutoWorkflow,
  entryKindLabel,
  entryLabel,
  entryPhaseStatus,
  entryWorkflow,
  planEntries,
} from './planEntries'
import type { PlanDocument, PlanEntry } from './types'

const NODE_STATUSES = new Set<ExecutionNodeStatus>(['pending', 'active', 'done', 'failed', 'blocked'])

function asStatus(value: string | undefined): ExecutionNodeStatus | undefined {
  if (value && NODE_STATUSES.has(value as ExecutionNodeStatus)) return value as ExecutionNodeStatus
  return undefined
}

function phaseStatus(status: string): ExecutionNodeStatus {
  return asStatus(status) ?? 'pending'
}

function asPortSide(value: string | undefined): ExecutionPortSide | undefined {
  if (value === 'top' || value === 'right' || value === 'bottom' || value === 'left') return value
  return undefined
}

function toExecutionEdges(
  edges: Array<{ from: string; to: string; label?: string; fromSide?: string; toSide?: string }>,
): ExecutionGraphEdge[] {
  return edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    label: edge.label,
    fromSide: asPortSide(edge.fromSide),
    toSide: asPortSide(edge.toSide),
  }))
}

function indexAnchors(plan: PlanDocument): Map<string, PlanEntry> {
  const anchors = new Map<string, PlanEntry>()
  planEntries(plan).forEach((entry, index) => {
    const anchor = entryAnchor(entry, index)
    if (anchor && !anchors.has(anchor)) anchors.set(anchor, entry)
  })
  return anchors
}

export type ExpectedWorkflowLayout = (
  nodes: ExecutionGraphNode[],
  edges: Array<{ from: string; to: string }>,
) => ExecutionGraphNode[]

/** Expected execution diagram. Layout is optional; the plan page lays the nodes out in the browser. */
export function buildExpectedGraph(plan: PlanDocument, layout?: ExpectedWorkflowLayout): ExecutionGraph | undefined {
  const anchors = indexAnchors(plan)
  const workflow = planEntries(plan).find((entry) => entry.type === 'workflow')
  const graph = workflow ? entryWorkflow(workflow) : undefined
  const place = layout ?? ((nodes: ExecutionGraphNode[]) => nodes)

  if (workflow && graph && graph.nodes.length > 0) {
    const nodes: ExecutionGraphNode[] = graph.nodes.map((node) => {
      const planRef = node.ref ?? (anchors.has(node.id) ? node.id : undefined)
      const linked = planRef ? anchors.get(planRef) : undefined
      const linkedLabel = linked ? entryLabel(linked) : undefined
      const linkedStatus = linked ? entryPhaseStatus(linked) : undefined
      return {
        id: node.id,
        label: node.label ?? linkedLabel ?? node.id,
        detail: node.detail ?? (linked ? entryKindLabel(linked) : undefined),
        status: asStatus(node.status) ?? (linkedStatus ? phaseStatus(linkedStatus) : undefined) ?? 'pending',
        x: node.x,
        y: node.y,
        planRef,
        planLabel: linkedLabel,
      }
    })
    const edges = toExecutionEdges(graph.edges)
    return {
      title: workflow.title ?? 'Expected workflow',
      nodes: place(nodes, edges),
      edges,
    }
  }

  const nodes: ExecutionGraphNode[] = []
  planEntries(plan).forEach((entry, index) => {
    if (entry.type === 'workflow' || !entryInAutoWorkflow(entry)) return
    const anchor = entryAnchor(entry, index)
    if (!anchor) return
    const label = entryLabel(entry) ?? anchor
    const status = entryPhaseStatus(entry)
    nodes.push({
      id: anchor,
      label,
      detail: entryKindLabel(entry),
      status: status ? phaseStatus(status) : 'pending',
      planRef: anchor,
      planLabel: label,
    })
  })

  if (nodes.length === 0) return undefined

  const edges = nodes.slice(1).map((node, index) => ({
    from: nodes[index]?.id ?? node.id,
    to: node.id,
  }))

  return {
    title: 'Expected workflow',
    nodes: place(nodes, edges),
    edges,
  }
}
