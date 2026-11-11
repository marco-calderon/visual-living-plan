import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

/** The id of a plan on this machine's service. The same path always maps to the same id. */
export function planIdForPath(planPath: string): string {
  return createHash('sha256').update(resolve(planPath)).digest('hex').slice(0, 24)
}
