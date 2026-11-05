import { furthestStatus, mergePlannedExecution, type ExecutionGraphNode, type ExecutionNodeStatus, type ExecutionState } from './execution'
import { planEntries } from './planEntries'
import type { CompletionState } from './processRecord'
import type { PhaseStatus, PlanDocument } from './types'
import { planToExpectedGraph } from './workflow'

export type PlanProgress = {
  phaseTotal: number
  phaseDone: number
  interactionTotal: number
  interactionDone: number
  completionRatio: number
  completionState: CompletionState
}

/** How much of one unit of work a status is worth. An active step is half done. */
const STATUS_WEIGHT: Record<ExecutionNodeStatus, number> = {
  pending: 0,
  active: 0.5,
  blocked: 0,
  failed: 0,
  done: 1,
}

/** The further along of two statuses, so a run never moves a phase backwards. */
function furthest(left: PhaseStatus, right: ExecutionNodeStatus | undefined): PhaseStatus {
  return furthestStatus(left, right) ?? left
}

/** Steps of the live run, with each step's plan block resolved through the plan's workflow. */
function liveSteps(plan: PlanDocument, execution: ExecutionState | undefined): ExecutionGraphNode[] {
  const live = execution?.graph?.nodes
  if (!live || live.length === 0) return []
  const liveIds = new Set(live.map((node) => node.id))
  const merged = mergePlannedExecution(planToExpectedGraph(plan), execution?.graph)
  return (merged?.nodes ?? []).filter((node) => liveIds.has(node.id))
}

/**
 * Completion counts phases and interactions. A done phase or an answered interaction is one unit, and an active phase
 * is half a unit. While a live run is pushed, a step linked to a phase moves that phase forward, and a step linked to
 * no phase or interaction counts as its own unit.
 */
export function measurePlan(
  plan: PlanDocument,
  answered: Iterable<string>,
  execution?: ExecutionState,
): PlanProgress {
  const phases = planEntries(plan).filter((entry) => entry.type === 'phase')
  const phaseIds = new Set(phases.flatMap((phase) => (phase.id ? [phase.id] : [])))
  const interactionIds = new Set(plan.interactionIds)

  const runStatus = new Map<string, ExecutionNodeStatus>()
  const looseSteps: ExecutionNodeStatus[] = []
  for (const step of liveSteps(plan, execution)) {
    const ref = step.planRef ?? step.id
    if (phaseIds.has(ref)) {
      const status = step.status ?? 'pending'
      runStatus.set(ref, furthest(runStatus.get(ref) ?? 'pending', status))
    } else if (!interactionIds.has(ref)) {
      looseSteps.push(step.status ?? 'pending')
    }
  }

  const statuses = phases.map((phase) => furthest(phase.status ?? 'pending', phase.id ? runStatus.get(phase.id) : undefined))
  const phaseTotal = phases.length
  const phaseDone = statuses.filter((status) => status === 'done').length
  const phaseActive = [...statuses, ...looseSteps].some((status) => status === 'active' || status === 'blocked')

  const answeredIds = new Set(answered)
  const interactionTotal = plan.interactionIds.length
  const interactionDone = plan.interactionIds.filter((id) => answeredIds.has(id)).length

  const total = phaseTotal + interactionTotal + looseSteps.length
  const done =
    statuses.reduce((sum, status) => sum + STATUS_WEIGHT[status], 0) +
    interactionDone +
    looseSteps.reduce((sum, status) => sum + STATUS_WEIGHT[status], 0)
  const finished = total > 0 && done >= total
  // Only a finished plan reads 100%. Anything started reads at least 1%.
  const completionRatio = total === 0 ? 0 : finished ? 100 : Math.min(99, Math.max(done > 0 ? 1 : 0, Math.round((done / total) * 100)))

  let completionState: CompletionState
  if (total === 0 || (done === 0 && !phaseActive)) completionState = 'idle'
  else if (finished) completionState = 'complete'
  else if (phaseActive) completionState = 'in_progress'
  else completionState = 'partial'

  return {
    phaseTotal,
    phaseDone,
    interactionTotal,
    interactionDone,
    completionRatio,
    completionState,
  }
}
