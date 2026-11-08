export const TIERS = ['free', 'pro', 'business'] as const
export type Tier = (typeof TIERS)[number]

export const PLAN_CAPS: Record<Tier, number> = { free: 1, pro: 10, business: 50 }
const MB = 1024 * 1024
/** Bytes of saved plan versions (title and body) an account may keep. */
export const STORAGE_CAPS: Record<Tier, number> = { free: 50 * MB, pro: 500 * MB, business: 5 * 1024 * MB }
export const SOCKET_CAPS: Record<Tier, number> = { free: 2, pro: 4, business: 50 }
export const IDLE_MS: Record<Tier, number> = {
  free: 60 * 60 * 1000,
  pro: 6 * 60 * 60 * 1000,
  business: 6 * 60 * 60 * 1000,
}

export type Actor = 'account' | 'viewer' | 'plan'

export function normalizeTier(value: unknown): Tier {
  return value === 'pro' || value === 'business' ? value : 'free'
}

/**
 * A tier caps how many plans have an agent listening at once, not how many plans are stored or
 * open. `listening` counts the account's other plans with an agent connected. A plan whose own
 * agent is already listening holds its slot, so another stream on it is not refused.
 */
export function agentSlotsFull(tier: Tier, listening: number, holdsSlot: boolean): boolean {
  if (holdsSlot) return false
  return listening >= PLAN_CAPS[tier]
}

export function agentSlotsMessage(tier: Tier): string {
  const cap = PLAN_CAPS[tier]
  return `This ${tier} account can have ${cap} plan${cap === 1 ? '' : 's'} with an agent listening at once. Stop an agent on another plan, or close that plan, then try again.`
}

export type PlanAction = 'register' | 'read' | 'submit' | 'upload' | 'edit' | 'agent' | 'close' | 'search' | 'versions'

export function allows(actor: Actor | null, action: PlanAction): boolean {
  if (action === 'register') return actor === 'account'
  // Anyone who can read the page can search it. The agent searches with its plan bearer.
  if (action === 'search') return actor === 'account' || actor === 'viewer' || actor === 'plan'
  // Saved versions stay with the owner and the agent, as /plans/<id>/versions/<seq>/document does.
  if (action === 'versions') return actor === 'account' || actor === 'plan'
  if (action === 'read' || action === 'submit') return actor === 'account' || actor === 'viewer'
  if (action === 'close') return actor === 'account' || actor === 'plan'
  // The owner edits the plan from the page. The agent uploads its file instead.
  if (action === 'edit') return actor === 'account'
  return actor === 'plan'
}
