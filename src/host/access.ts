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

export function allows(actor: Actor | null, action: 'register' | 'read' | 'submit' | 'upload' | 'agent' | 'close'): boolean {
  if (action === 'register') return actor === 'account'
  if (action === 'read' || action === 'submit') return actor === 'account' || actor === 'viewer'
  return actor === 'plan'
}
