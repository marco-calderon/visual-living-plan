import type {
  ExecutionGraph,
  ExecutionGraphEdge,
  ExecutionGraphNode,
  ExecutionNodeStatus,
  ExecutionPortSide,
  ExecutionState,
} from './execution'
import { blockAnchorId } from './parse'
import { layoutWorkflowNodes } from './layoutGraph'
import type { PlanBlock, PlanDocument } from './types'

const NODE_STATUSES = new Set<ExecutionNodeStatus>([
  'pending',
  'active',
  'done',
  'failed',
  'blocked',
])

function asStatus(value: string | undefined): ExecutionNodeStatus | undefined {
  if (value && NODE_STATUSES.has(value as ExecutionNodeStatus)) {
    return value as ExecutionNodeStatus
  }
  return undefined
}

function phaseStatus(status: string): ExecutionNodeStatus {
  return asStatus(status) ?? 'pending'
}

export function blockPlanLabel(block: PlanBlock): string | undefined {
  switch (block.type) {
    case 'phase':
      return block.title
    case 'choice':
    case 'approve':
    case 'form':
      return block.prompt
    case 'questions':
      return block.prompt ?? 'Questions'
    case 'checklist':
      return block.title ?? 'Checklist'
    case 'callout':
      return block.title ?? block.kind
    case 'workflow':
      return block.title ?? 'Workflow'
    case 'markdown':
      return undefined
  }
}

function blockKindLabel(block: PlanBlock): string | undefined {
  switch (block.type) {
    case 'phase':
      return 'Phase'
    case 'choice':
      return 'Choice'
    case 'approve':
      return 'Approval'
    case 'form':
      return 'Form'
    case 'questions':
      return 'Questions'
    case 'checklist':
      return 'Checklist'
    case 'callout':
      return block.kind
    default:
      return undefined
  }
}

function includeInAutoWorkflow(block: PlanBlock): boolean {
  switch (block.type) {
    case 'phase':
    case 'choice':
    case 'approve':
    case 'form':
    case 'questions':
      return true
    case 'checklist':
    case 'callout':
      return Boolean(block.id || block.title)
    default:
      return false
  }
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

function layoutNodes(
  nodes: ExecutionGraphNode[],
  edges: Array<{ from: string; to: string }>,
): ExecutionGraphNode[] {
  return layoutWorkflowNodes(nodes, edges)
}

function indexAnchors(plan: PlanDocument): Map<string, PlanBlock> {
  const anchors = new Map<string, PlanBlock>()
  plan.blocks.forEach((block, index) => {
    const anchor = blockAnchorId(block, index)
    if (anchor && !anchors.has(anchor)) anchors.set(anchor, block)
  })
  return anchors
}

/** A plan must name its execution path with a workflow block. */
export function workflowRequirementError(plan: PlanDocument): string | undefined {
  const workflow = plan.blocks.find((block) => block.type === 'workflow')
  if (!workflow || workflow.type !== 'workflow' || workflow.nodes.length === 0) {
    return 'A plan requires a workflow block. That block is the execution path.'
  }
  return undefined
}

/** Expected execution diagram for a plan, available before a live run starts. */
export function planToExpectedGraph(plan: PlanDocument): ExecutionGraph | undefined {
  const anchors = indexAnchors(plan)
  const workflow = plan.blocks.find((block) => block.type === 'workflow')

  if (workflow && workflow.type === 'workflow' && workflow.nodes.length > 0) {
    const nodes: ExecutionGraphNode[] = workflow.nodes.map((node) => {
      const planRef = node.ref ?? (anchors.has(node.id) ? node.id : undefined)
      const linked = planRef ? anchors.get(planRef) : undefined
      const linkedLabel = linked ? blockPlanLabel(linked) : undefined
      const linkedStatus = linked?.type === 'phase' ? phaseStatus(linked.status) : undefined
      return {
        id: node.id,
        label: node.label ?? linkedLabel ?? node.id,
        detail: node.detail ?? (linked ? blockKindLabel(linked) : undefined),
        status: asStatus(node.status) ?? linkedStatus ?? 'pending',
        x: node.x,
        y: node.y,
        planRef,
        planLabel: linkedLabel,
      }
    })
    const edges = toExecutionEdges(workflow.edges)
    return {
      title: workflow.title ?? 'Expected workflow',
      nodes: layoutNodes(nodes, edges),
      edges,
    }
  }

  const nodes: ExecutionGraphNode[] = []
  plan.blocks.forEach((block, index) => {
    if (block.type === 'workflow' || !includeInAutoWorkflow(block)) return
    const anchor = blockAnchorId(block, index)
    if (!anchor) return
    const label = blockPlanLabel(block) ?? anchor
    nodes.push({
      id: anchor,
      label,
      detail: blockKindLabel(block),
      status: block.type === 'phase' ? phaseStatus(block.status) : 'pending',
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
    nodes: layoutNodes(nodes, edges),
    edges,
  }
}

export function withPlannedWorkflow(execution: ExecutionState, plan: PlanDocument): ExecutionState {
  return {
    ...execution,
    planned: planToExpectedGraph(plan),
  }
}
