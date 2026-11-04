import { viewingPlanVersion } from './versionView.ts'

type PlanEventsWindow = Window & {
  __LIVE_PLAN_BASE__?: string
  __LIVE_PLAN_TRANSPORT__?: 'sse' | 'websocket'
  /** Shared plan-page EventSource (owned by the inline page script when present). */
  __livingPlanEvents?: EventSource
  __livingPlanSocket?: WebSocket
  __livingPlanHub?: EventTarget
  __livingPlanEventsReleaseBound?: boolean
}

function apiPath(path: string): string {
  const base = (window as PlanEventsWindow).__LIVE_PLAN_BASE__ ?? ''
  return `${base}${path}`
}

function bindRelease(win: PlanEventsWindow, source: EventSource): void {
  if (win.__livingPlanEventsReleaseBound) return
  win.__livingPlanEventsReleaseBound = true
  const release = () => {
    if (win.__livingPlanEvents !== source) return
    source.close()
    delete win.__livingPlanEvents
    delete win.__livingPlanEventsReleaseBound
  }
  window.addEventListener('pagehide', release)
  window.addEventListener('beforeunload', release)
}

let socketAttempt = 0
let socketTimer = 0
let socketStopped = false
let socketOnlineBound = false

function ensureSocket(): EventTarget {
  const win = window as PlanEventsWindow
  if (win.__livingPlanHub && win.__livingPlanSocket && win.__livingPlanSocket.readyState !== WebSocket.CLOSED) {
    return win.__livingPlanHub
  }
  const hub = win.__livingPlanHub ?? new EventTarget()
  win.__livingPlanHub = hub
  const http = new URL(apiPath('/api/events'), window.location.href)
  http.protocol = http.protocol === 'https:' ? 'wss:' : 'ws:'

  const open = () => {
    if (socketStopped || !navigator.onLine) return
    if (win.__livingPlanSocket && win.__livingPlanSocket.readyState !== WebSocket.CLOSED) return
    let socket: WebSocket
    try {
      socket = new WebSocket(http.toString())
    } catch {
      scheduleSocket()
      return
    }
    socket.addEventListener('open', () => {
      socketAttempt = 0
    })
    socket.addEventListener('message', (message) => {
      try {
        const parsed = JSON.parse(String(message.data)) as { event?: string; data?: unknown }
        if (!parsed.event) return
        const data = typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data ?? null)
        hub.dispatchEvent(new MessageEvent(parsed.event, { data }))
      } catch {
        // Ignore a frame that is not a plan event.
      }
    })
    socket.addEventListener('error', () => {
      // `close` follows. An offline connect must not surface as an uncaught error.
    })
    socket.addEventListener('close', () => {
      if (socketStopped || win.__livingPlanSocket !== socket) return
      scheduleSocket()
    })
    win.__livingPlanSocket = socket
  }

  if (!socketOnlineBound) {
    socketOnlineBound = true
    window.addEventListener('online', () => {
      socketAttempt = 0
      window.clearTimeout(socketTimer)
      socketTimer = 0
      open()
    })
    const stop = () => {
      socketStopped = true
      window.clearTimeout(socketTimer)
      win.__livingPlanSocket?.close()
    }
    window.addEventListener('pagehide', stop)
    window.addEventListener('beforeunload', stop)
  }
  open()
  return hub
}

function scheduleSocket(): void {
  if (socketStopped || socketTimer) return
  const wait = Math.min(30_000, 1000 * 2 ** socketAttempt)
  socketAttempt += 1
  socketTimer = window.setTimeout(() => {
    socketTimer = 0
    const win = window as PlanEventsWindow
    if (!navigator.onLine) return
    if (win.__livingPlanSocket && win.__livingPlanSocket.readyState !== WebSocket.CLOSED) return
    ensureSocket()
  }, wait)
}

function ensurePlanEvents(): EventTarget {
  const win = window as PlanEventsWindow
  if (win.__LIVE_PLAN_TRANSPORT__ === 'websocket') return ensureSocket()
  const existing = win.__livingPlanEvents
  if (existing && existing.readyState !== EventSource.CLOSED) {
    bindRelease(win, existing)
    return existing
  }
  const source = new EventSource(apiPath('/api/events'))
  win.__livingPlanEvents = source
  bindRelease(win, source)
  return source
}

/**
 * Subscribe to the plan event stream.
 *
 * Chromium allows ~6 HTTP/1.1 connections per host. Each plan page used to open
 * three EventSources (inline script + PlanSelector + execution canvas). Three
 * open plan tabs then held nine long-lived streams and simultaneous reloads
 * hung waiting for a free connection. Reuse one stream per page instead.
 *
 * The stream lives for the page lifetime and closes on pagehide/beforeunload.
 * React effect cleanup only removes the listener.
 */
export function subscribePlanEvents(
  type: string,
  listener: (event: MessageEvent) => void,
): () => void {
  // A saved version never changes, so it opens no live stream.
  if (viewingPlanVersion() !== null) return () => {}
  const source = ensurePlanEvents()
  source.addEventListener(type, listener as EventListener)
  return () => {
    source.removeEventListener(type, listener as EventListener)
  }
}
