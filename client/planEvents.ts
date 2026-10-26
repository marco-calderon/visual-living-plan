type PlanEventsWindow = Window & {
  __LIVE_PLAN_BASE__?: string
  /** Shared plan-page EventSource (owned by the inline page script when present). */
  __livingPlanEvents?: EventSource
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

function ensurePlanEvents(): EventSource {
  const win = window as PlanEventsWindow
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
