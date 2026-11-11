/**
 * Shared by the local session and the hosted plan: how a review round starts.
 *
 * Entering review clears the previous verdict so the person can give a new one. A verdict the agent
 * has not received yet is the exception. It is kept, so a `review` started again after a drop prints
 * it, and `mode review` is refused until `events` delivers it.
 */

/** Refusal for `mode review` while the person's last verdict is still waiting for the agent. */
export const UNREAD_VERDICT =
  'The person already sent a review verdict that no agent has received. Run `live-plan events --url <plan-url>` to read it, then switch mode again.'

export const INVALID_ITERATION = 'iteration must be a whole number of 1 or more'

/** A review round number from a request body. `undefined` keeps the round. `'invalid'` is a bad value. */
export function readIteration(value: unknown): number | undefined | 'invalid' {
  if (value === undefined || value === null) return undefined
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) return 'invalid'
  return number
}
