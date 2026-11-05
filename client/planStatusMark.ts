import { PLAN_STATUS_COLOR, PLAN_STATUS_LABEL, planStatus, type PlanStatus } from '../src/planStatus.ts'
import { subscribePlanConnection, subscribePlanEvents, type PlanConnectionState } from './planEvents.ts'

/**
 * Keeps `body[data-plan-status]`, the tab icon, and the execution lock in step with the plan.
 * The title bar dot is CSS on that attribute. The tab icon is the logo with
 * the same dot, drawn on a canvas.
 *
 * The state comes from the page's embedded JSON first, then from the stream: `hello` each time
 * the stream opens, and `mode`, `review`, and `execution` as they happen. While the stream is
 * down the label says so, because the status shown may be out of date.
 */

/** Fired on window when the run turns on or off. `detail.active` is the new state. */
export const EXECUTION_LOCK_EVENT = 'living-plan-execution-lock'
/** A short drop is not worth a label change. */
const RECONNECTING_LABEL_AFTER_MS = 3000

const LOGO_SRC = '/favicon.png'
const ICON_SIZE = 64

type StatusWindow = Window & { __livingPlanStatusBound?: boolean }

const state: { mode: string; decision: string; active: boolean; connection: PlanConnectionState } = {
  mode: 'watch',
  decision: '',
  active: false,
  connection: 'open',
}
let lockApplied: boolean | undefined
let reconnectingTimer = 0
let showReconnecting = false

function readJson<T>(id: string): T | null {
  const text = document.getElementById(id)?.textContent
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

let logo: Promise<HTMLImageElement | null> | undefined
function loadLogo(): Promise<HTMLImageElement | null> {
  logo ??= new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = LOGO_SRC
  })
  return logo
}

const iconCache = new Map<PlanStatus, string>()
async function iconFor(status: PlanStatus): Promise<string | null> {
  const cached = iconCache.get(status)
  if (cached) return cached
  const image = await loadLogo()
  const canvas = document.createElement('canvas')
  canvas.width = ICON_SIZE
  canvas.height = ICON_SIZE
  const context = canvas.getContext('2d')
  if (!image || !context) return null
  context.drawImage(image, 0, 0, ICON_SIZE, ICON_SIZE)
  // Bottom-right dot with a white ring so it reads on light and dark tab strips.
  const radius = ICON_SIZE * 0.2
  const center = ICON_SIZE - radius - 1
  context.beginPath()
  context.arc(center, center, radius + ICON_SIZE * 0.06, 0, Math.PI * 2)
  context.fillStyle = '#ffffff'
  context.fill()
  context.beginPath()
  context.arc(center, center, radius, 0, Math.PI * 2)
  context.fillStyle = PLAN_STATUS_COLOR[status]
  context.fill()
  let url: string
  try {
    url = canvas.toDataURL('image/png')
  } catch {
    return null
  }
  iconCache.set(status, url)
  return url
}

let applied: PlanStatus | undefined
let drawing = 0

async function setFavicon(status: PlanStatus): Promise<void> {
  const ticket = ++drawing
  const url = await iconFor(status)
  // A later status won while this one was drawing.
  if (!url || ticket !== drawing) return
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
  if (links.length === 0) {
    const link = document.createElement('link')
    link.rel = 'icon'
    document.head.append(link)
    links.push(link)
  }
  for (const link of links) {
    link.type = 'image/png'
    link.removeAttribute('sizes')
    link.href = url
  }
}

/** The lock banner and the locked plan panel, on the local page and the hosted page alike. */
function applyLock(active: boolean): void {
  document.body.dataset.planExecution = active ? 'live' : 'idle'
  document.querySelectorAll<HTMLElement>('[data-tab-panel="plan"]').forEach((panel) => {
    panel.classList.toggle('plan-locked', active)
  })
  document.querySelectorAll<HTMLElement>('[data-lock-banner]').forEach((banner) => {
    banner.hidden = !active
  })
  if (lockApplied === active) return
  const first = lockApplied === undefined
  lockApplied = active
  if (!first) window.dispatchEvent(new CustomEvent(EXECUTION_LOCK_EVENT, { detail: { active } }))
}

function apply(): void {
  const status = planStatus(state)
  document.body.dataset.planStatus = status
  const label = PLAN_STATUS_LABEL[status]
  document.querySelectorAll<HTMLElement>('[data-plan-status-label]').forEach((node) => {
    node.textContent = showReconnecting ? 'Reconnecting' : label
    if (showReconnecting) node.title = `Last known: ${label}`
    else node.removeAttribute('title')
  })
  applyLock(state.active)
  if (status === applied) return
  applied = status
  void setFavicon(status)
}

function setConnection(next: PlanConnectionState): void {
  state.connection = next
  window.clearTimeout(reconnectingTimer)
  reconnectingTimer = 0
  if (next === 'open' || next === 'connecting') {
    if (showReconnecting) {
      showReconnecting = false
      apply()
    }
    return
  }
  reconnectingTimer = window.setTimeout(() => {
    reconnectingTimer = 0
    if (state.connection === 'open') return
    showReconnecting = true
    apply()
  }, RECONNECTING_LABEL_AFTER_MS)
}

function parse(event: MessageEvent): Record<string, unknown> | null {
  try {
    const value = JSON.parse(String(event.data)) as unknown
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function decisionOf(review: unknown): string {
  const decision = (review as { decision?: unknown } | null)?.decision
  return typeof decision === 'string' ? decision : ''
}

export function startPlanStatusMark(): void {
  const win = window as StatusWindow
  if (win.__livingPlanStatusBound) return
  win.__livingPlanStatusBound = true

  state.mode = document.body.dataset.planMode || 'watch'
  state.decision = decisionOf(readJson('living-plan-review'))
  state.active = Boolean(readJson<{ active?: boolean }>('living-plan-bootstrap')?.active)
  apply()

  subscribePlanConnection(setConnection)
  // Sent each time the stream opens, so a page that missed a start or a stop catches up.
  subscribePlanEvents('hello', (event) => {
    const payload = parse(event)
    if (!payload) return
    if (typeof payload.mode === 'string') state.mode = payload.mode
    if ('review' in payload) state.decision = decisionOf(payload.review)
    const execution = payload.execution as { active?: unknown } | null | undefined
    if (execution && typeof execution === 'object') state.active = Boolean(execution.active)
    apply()
  })
  subscribePlanEvents('mode', (event) => {
    const payload = parse(event)
    if (!payload || typeof payload.mode !== 'string') return
    state.mode = payload.mode
    state.decision = decisionOf(payload.review)
    apply()
  })
  subscribePlanEvents('review', (event) => {
    const payload = parse(event)
    if (!payload) return
    state.decision = decisionOf(payload)
    // Approve and deny return the session to watch.
    if (state.decision === 'approve' || state.decision === 'deny') state.mode = 'watch'
    apply()
  })
  subscribePlanEvents('execution', (event) => {
    const payload = parse(event)
    if (!payload) return
    state.active = Boolean(payload.active)
    apply()
  })
}
