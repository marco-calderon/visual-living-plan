import type { ExecutionState } from './execution'
import { workState } from './planStatus'
import type { InteractionResponse } from './types'

/**
 * After the person approves, the run follows the plan file, so the agent does not have to call
 * `execution start` and `execution stop`.
 *
 * - Approval (a review verdict of approve, or an approve gate answered yes) arms it.
 * - While armed and stopped, a workflow step moving past pending starts the run. The page shows Executing.
 * - While running, every step done or a step failed ends it. The page shows Completed or Stopped.
 *   It stays armed, so a step set back to active starts the run again.
 * - An explicit `execution stop` turns it off until the next approval. `execution start` and `push`
 *   still work and leave it as it is.
 *
 * Ending a run whose steps are all done or failed happens whatever started it, so a forgotten
 * `execution stop` no longer leaves the page on Executing.
 */
export function nextRunState(view: ExecutionState): { active: boolean } | null {
  // A pushed graph without a node list is logged by the session and does not count here.
  const graph = Array.isArray(view.graph?.nodes) ? view.graph : undefined
  const work = workState({ planned: view.planned, graph })
  if (view.active) return work === 'completed' || work === 'failed' ? { active: false } : null
  if (view.follow === 'armed' && work === 'started') return { active: true }
  return null
}

/** The approval that arms the run: an approve verdict, or an approve gate answered yes. */
export function approvesRun(input: { decision?: string; response?: InteractionResponse | null }): boolean {
  if (input.decision === 'approve') return true
  return input.response?.kind === 'approve' && input.response.approved === true
}
