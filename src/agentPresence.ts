/**
 * Whether an agent is connected to a plan right now.
 *
 * An agent is connected while a CLI command holds the plan's agent stream open: `serve`,
 * `events`, `wait`, `watch`, and `review` all do while they wait for the next plan action.
 * The host counts those streams. A plan whose page is open but whose agent is not waiting
 * on it is open, not active.
 */
export type AgentPresence = {
  /** At least one agent stream is open. */
  connected: boolean
  /** How many agent streams are open. */
  clients: number
  /** When an agent stream last opened or closed. Null when no agent has connected yet. */
  seenAt: number | null
}

/** The page waits this long before it shows a drop, so `events` exiting and starting again does not flicker. */
export const AGENT_DISCONNECT_GRACE_MS = 4000

/** A live agent stream gets a ping this often, so a peer that went away is noticed and removed. */
export const AGENT_KEEPALIVE_MS = 20_000

/**
 * A hosted plan saves its presence on the dashboard row and renews it this often while an agent
 * is connected. A row whose renewal is older than `AGENT_LEASE_MS` reads as disconnected, so a
 * plan object that restarted without seeing its sockets close does not stay active.
 */
export const AGENT_LEASE_REFRESH_MS = 60_000
export const AGENT_LEASE_MS = 3 * 60_000

export const AGENT_PRESENCE_LABEL = {
  connected: 'Agent connected',
  disconnected: 'No agent connected',
} as const

export function agentPresence(clients: number, seenAt: number | null): AgentPresence {
  const count = Math.max(0, Math.round(Number(clients) || 0))
  return { connected: count > 0, clients: count, seenAt: seenAt ?? null }
}

/** Presence from an untrusted payload, such as a stream event or a stored row. */
export function readAgentPresence(value: unknown): AgentPresence | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (typeof raw.connected !== 'boolean') return null
  const clients = Number(raw.clients)
  const seenAt = Number(raw.seenAt)
  return {
    connected: raw.connected,
    clients: Number.isFinite(clients) ? Math.max(0, Math.round(clients)) : raw.connected ? 1 : 0,
    seenAt: raw.seenAt != null && Number.isFinite(seenAt) && seenAt > 0 ? seenAt : null,
  }
}

/** Short "5m ago" text for when the agent was last seen. */
export function agentSeenAgo(seenAt: number | null | undefined, now = Date.now()): string {
  if (!seenAt) return ''
  const seconds = Math.max(0, Math.round((now - seenAt) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** The text a page or a dashboard row shows for the agent. */
export function agentPresenceText(presence: Pick<AgentPresence, 'connected' | 'seenAt'> | null | undefined, now = Date.now()): string {
  if (presence?.connected) return AGENT_PRESENCE_LABEL.connected
  const ago = agentSeenAgo(presence?.seenAt, now)
  return ago ? `${AGENT_PRESENCE_LABEL.disconnected} · last seen ${ago}` : AGENT_PRESENCE_LABEL.disconnected
}
