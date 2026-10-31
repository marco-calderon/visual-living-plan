import type { ExecutionGraph, ExecutionState } from './execution'
import { buildExpectedGraph } from './expectedWorkflow'
import { layoutWorkflowNodes } from './layoutGraph'
import { entryWorkflow, planEntries } from './planEntries'
import type { PlanBlock, PlanDocument } from './types'

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

/** A plan must name its execution path with a workflow block. */
export function workflowRequirementError(plan: PlanDocument): string | undefined {
  const workflow = planEntries(plan).find((entry) => entry.type === 'workflow')
  const graph = workflow ? entryWorkflow(workflow) : undefined
  if (!graph || graph.nodes.length === 0) {
    return 'A plan requires a workflow block. That block is the execution path.'
  }
  return undefined
}

/** Expected execution diagram for a plan, available before a live run starts. */
export function planToExpectedGraph(plan: PlanDocument): ExecutionGraph | undefined {
  return buildExpectedGraph(plan, (nodes, edges) => layoutWorkflowNodes(nodes, edges))
}

export function withPlannedWorkflow(execution: ExecutionState, plan: PlanDocument): ExecutionState {
  return {
    ...execution,
    planned: planToExpectedGraph(plan),
  }
}
