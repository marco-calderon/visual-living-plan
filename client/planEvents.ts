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

function ensureSocket(): EventTarget {
  const win = window as PlanEventsWindow
  if (win.__livingPlanHub && win.__livingPlanSocket && win.__livingPlanSocket.readyState !== WebSocket.CLOSED) {
    return win.__livingPlanHub
  }
  const hub = new EventTarget()
  const http = new URL(apiPath('/api/events'), window.location.href)
  http.protocol = http.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(http.toString())
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
  const release = () => {
    if (win.__livingPlanSocket !== socket) return
    socket.close()
  }
  window.addEventListener('pagehide', release)
  window.addEventListener('beforeunload', release)
  win.__livingPlanHub = hub
  win.__livingPlanSocket = socket
  return hub
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
  const source = ensurePlanEvents()
  source.addEventListener(type, listener as EventListener)
  return () => {
    source.removeEventListener(type, listener as EventListener)
  }
}
