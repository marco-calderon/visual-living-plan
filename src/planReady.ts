import { compilePlanMdx } from './planMdx/compilePlanMdx'
import { planSourceToMdx } from './planMdx/source'

/**
 * Why this plan source should not reach the page yet, or undefined when it can.
 *
 * An agent edit can land half written, or leave a tag open. The page compiles the plan as MDX
 * the same way, so a source that fails here would replace the plan with an error. The watchers
 * keep the last good source until the file is fixed.
 */
export async function planNotReadyReason(source: string): Promise<string | undefined> {
  if (!source.trim()) return 'The plan file is empty.'
  try {
    await compilePlanMdx(planSourceToMdx(source))
    return undefined
  } catch (error) {
    return error instanceof Error && error.message ? error.message : 'The plan does not compile.'
  }
}
