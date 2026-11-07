export const TIERS = ['free', 'pro', 'business'] as const
export type Tier = (typeof TIERS)[number]

export const PLAN_CAPS: Record<Tier, number> = { free: 1, pro: 10, business: 50 }
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

/** A reattached plan does not consume another slot. */
export function planCapReached(tier: Tier, openPlans: number, reattach: boolean): boolean {
  if (reattach) return false
  return openPlans >= PLAN_CAPS[tier]
}

export type PlanAction = 'register' | 'read' | 'submit' | 'upload' | 'agent' | 'close' | 'search' | 'versions'

export function allows(actor: Actor | null, action: PlanAction): boolean {
  if (action === 'register') return actor === 'account'
  // Anyone who can read the page can search it. The agent searches with its plan bearer.
  if (action === 'search') return actor === 'account' || actor === 'viewer' || actor === 'plan'
  // Saved versions stay with the owner and the agent, as /plans/<id>/versions/<seq>/document does.
  if (action === 'versions') return actor === 'account' || actor === 'plan'
  if (action === 'read' || action === 'submit') return actor === 'account' || actor === 'viewer'
  if (action === 'close') return actor === 'account' || actor === 'plan'
  return actor === 'plan'
}
