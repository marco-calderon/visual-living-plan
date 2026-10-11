import type { CompletionState } from './processRecord.js'
import type { PlanDocument } from './types.js'

export type PlanProgress = {
  phaseTotal: number
  phaseDone: number
  interactionTotal: number
  interactionDone: number
  completionRatio: number
  completionState: CompletionState
}

/** Completion is phases marked done plus interactions that already have an answer. */
export function measurePlan(plan: PlanDocument, answered: Iterable<string>): PlanProgress {
  const phases = plan.blocks.filter((block) => block.type === 'phase')
  const phaseTotal = phases.length
  const phaseDone = phases.filter((block) => block.status === 'done').length
  const phaseActive = phases.some((block) => block.status === 'active' || block.status === 'blocked')
  const answeredIds = new Set(answered)
  const interactionTotal = plan.interactionIds.length
  const interactionDone = plan.interactionIds.filter((id) => answeredIds.has(id)).length
  const total = phaseTotal + interactionTotal
  const done = phaseDone + interactionDone
  const completionRatio = total === 0 ? 0 : Math.round((done / total) * 100)

  let completionState: CompletionState
  if (total === 0 || (done === 0 && !phaseActive)) completionState = 'idle'
  else if (completionRatio >= 100) completionState = 'complete'
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
