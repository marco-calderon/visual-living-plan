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

const ICON_PATHS = {
  // Lucide `bot`.
  on: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  // Lucide `bot-off`: the same robot, struck through, so the state reads without color.
  off: '<path d="M13.67 8H18a2 2 0 0 1 2 2v4.33"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M22 22 2 2"/><path d="M8 8H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 1.414-.586"/><path d="M9 13v2"/><path d="M9.67 4H12v2.33"/>',
} as const

/** The agent icon: a robot while connected, a struck-through robot while not. */
export function agentIconSvg(connected: boolean): string {
  const state = connected ? 'on' : 'off'
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-agent-icon="${state}">${ICON_PATHS[state]}</svg>`
}

/** Both icons, for markup whose state CSS switches on `body[data-agent]`. */
export const AGENT_ICONS_SVG = agentIconSvg(true) + agentIconSvg(false)
