import { viewingPlanVersion } from './versionView.ts'

/**
 * The plan page's one live connection to its host.
 *
 * Every listener on the page attaches to one hub (`window.__livingPlanHub`), never to the
 * transport itself. The transport underneath is an EventSource on the local service and a
 * WebSocket on the hosted plan. When it drops, it is opened again and the listeners stay put.
 *
 * - The host sends `hello` with the current mode, review, and run each time the stream opens.
 *   Listeners apply it, so a page that was disconnected catches up on what it missed. The
 *   stream counts as open once something from the host arrives, not when the request starts.
 * - The host pings an open stream. A stream that goes quiet for longer than `STALE_MS` is
 *   treated as dead and opened again, which catches a half-open connection after sleep or a
 *   network change.
 * - The stream opens again on `online`, on `pageshow` from the back-forward cache, and when the
 *   tab becomes visible with a closed or quiet stream.
 *
 * Chromium allows about 6 HTTP/1.1 connections per host, so a page keeps one stream for all its
 * listeners instead of one per component.
 */

export type PlanConnectionState = 'connecting' | 'open' | 'reconnecting'

type PlanEventsWindow = Window & {
  __LIVE_PLAN_BASE__?: string
  __LIVE_PLAN_TRANSPORT__?: 'sse' | 'websocket'
  __livingPlanHub?: EventTarget
  __livingPlanConnection?: Connection
  __livingPlanReport?: (level: string, message: string, detail: string, source: string) => void
}

/** Events the hosts send to a page. A listener for another name is forwarded once it subscribes. */
const KNOWN_EVENTS = ['hello', 'ping', 'plan', 'reload', 'theme', 'execution', 'interaction', 'review', 'mode', 'comment', 'agent', 'error']

/** Longer than two host pings (20 seconds apart), so one late ping does not drop a live stream. */
export const STALE_MS = 50_000
const PING_MS = 20_000
const MAX_BACKOFF_MS = 15_000
const CONNECTION_EVENT = 'living-plan-connection'

function apiPath(path: string): string {
  const base = (window as PlanEventsWindow).__LIVE_PLAN_BASE__ ?? ''
  return `${base}${path}`
}

export function planEventHub(): EventTarget {
  const win = window as PlanEventsWindow
  win.__livingPlanHub ??= new EventTarget()
  return win.__livingPlanHub
}

/** How long to wait before the next attempt. Doubles from one second, capped at 15. */
export function reconnectDelay(attempt: number): number {
  return Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, attempt))
}

type Transport = { close: () => void }

class Connection {
  readonly hub: EventTarget
  state: PlanConnectionState = 'connecting'
  private transport: Transport | null = null
  private attempt = 0
  private retryTimer = 0
  private watchdog = 0
  private lastHeard = 0
  private forwarded = new Set<string>()
  private source: EventSource | null = null
  private suspended = false

  constructor(hub: EventTarget) {
    this.hub = hub
    window.addEventListener('online', () => this.reconnectNow())
    // A plan on this machine works without a network, so only a remote plan waits for one.
    window.addEventListener('offline', () => {
      if (!this.onLoopback()) this.setState('reconnecting')
    })
    // Leaving the page closes the stream. A page restored from the back-forward cache opens it again.
    window.addEventListener('pagehide', () => this.suspend())
    window.addEventListener('pageshow', (event) => {
      if ((event as PageTransitionEvent).persisted || this.suspended) this.resume()
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      if (!this.transport || this.isQuiet()) this.reconnectNow()
    })
    this.open()
  }

  private onLoopback(): boolean {
    const host = window.location.hostname
    return host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1'
  }

  private isWebSocket(): boolean {
    return (window as PlanEventsWindow).__LIVE_PLAN_TRANSPORT__ === 'websocket'
  }

  private isQuiet(): boolean {
    return this.state !== 'open' || Date.now() - this.lastHeard > STALE_MS
  }

  private warnedAt = 0

  private setState(next: PlanConnectionState): void {
    if (this.state === next) return
    this.state = next
    if (next === 'reconnecting') this.warn()
    document.body.dataset.planConnection = next
    this.hub.dispatchEvent(new CustomEvent(CONNECTION_EVENT, { detail: { state: next } }))
  }

  /** Into the plan's development log, at most every 10 seconds. Not shown on the page. */
  private warn(): void {
    const report = (window as PlanEventsWindow).__livingPlanReport
    if (typeof report !== 'function') return
    const now = Date.now()
    if (now - this.warnedAt < 10_000) return
    this.warnedAt = now
    report('warn', 'The plan event stream is not connected.', '', 'page')
  }

  private heard(): void {
    this.lastHeard = Date.now()
    this.attempt = 0
    this.setState('open')
  }

  private dispatch(type: string, data: string): void {
    this.heard()
    if (type === 'ping') return
    this.hub.dispatchEvent(new MessageEvent(type, { data }))
  }

  /** Forward one named event from the EventSource to the hub. WebSocket frames carry their own name. */
  forward(type: string): void {
    if (this.forwarded.has(type)) return
    this.forwarded.add(type)
    this.source?.addEventListener(type, (event) => {
      // A dropped connection is also an `error` event on an EventSource, with no data. Only the host's own
      // `error` message carries data, and only that one is forwarded.
      if (!(event instanceof MessageEvent) || typeof event.data !== 'string') return
      this.dispatch(type, event.data)
    })
  }

  private open(): void {
    if (this.suspended || this.transport) return
    if (navigator.onLine === false && !this.onLoopback()) {
      this.setState('reconnecting')
      return
    }
    try {
      this.transport = this.isWebSocket() ? this.openSocket() : this.openEventSource()
    } catch {
      this.transport = null
      this.scheduleRetry()
      return
    }
    this.lastHeard = Date.now()
    window.clearInterval(this.watchdog)
    this.watchdog = window.setInterval(() => {
      if (!this.transport) return
      if (Date.now() - this.lastHeard > STALE_MS) this.reconnectNow()
    }, PING_MS / 2)
  }

  private openEventSource(): Transport {
    const source = new EventSource(apiPath('/api/events'))
    this.source = source
    const known = [...this.forwarded]
    this.forwarded = new Set()
    for (const type of new Set([...KNOWN_EVENTS, ...known])) this.forward(type)
    // The stream counts as live once the host is heard: its hello comes first.
    source.addEventListener('error', () => {
      if (this.source !== source) return
      // The browser retries a dropped stream by itself. A refused one (an HTTP error while the
      // service restarts) is CLOSED for good, so this page opens a new one.
      if (source.readyState === EventSource.CLOSED) this.dropped()
      else this.setState('reconnecting')
    })
    return {
      close: () => {
        source.close()
        if (this.source === source) this.source = null
      },
    }
  }

  private openSocket(): Transport {
    const url = new URL(apiPath('/api/events'), window.location.href)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url.toString())
    let ping = 0
    socket.addEventListener('open', () => {
      // The hosted plan answers `ping` with `pong` without waking, so a quiet socket can be told
      // from a dead one. The first ping goes now, so an open socket is heard even before its hello.
      const send = () => {
        if (socket.readyState === WebSocket.OPEN) socket.send('ping')
      }
      send()
      ping = window.setInterval(send, PING_MS)
    })
    socket.addEventListener('message', (message) => {
      const raw = String(message.data)
      if (raw === 'pong') {
        this.heard()
        return
      }
      try {
        const parsed = JSON.parse(raw) as { event?: string; data?: unknown }
        if (!parsed.event) return
        const data = typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data ?? null)
        this.dispatch(parsed.event, data)
      } catch {
        // Ignore a frame that is not a plan event.
      }
    })
    socket.addEventListener('error', () => {
      // `close` follows. An offline connect must not surface as an uncaught error.
    })
    socket.addEventListener('close', () => {
      window.clearInterval(ping)
      if (this.transport !== transport) return
      this.dropped()
    })
    const transport: Transport = {
      close: () => {
        window.clearInterval(ping)
        try {
          socket.close()
        } catch {
          // Already closed.
        }
      },
    }
    return transport
  }

  private dropped(): void {
    this.transport?.close()
    this.transport = null
    this.scheduleRetry()
  }

  private scheduleRetry(): void {
    this.setState('reconnecting')
    if (this.suspended || this.retryTimer) return
    const wait = reconnectDelay(this.attempt)
    this.attempt += 1
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = 0
      this.open()
    }, wait)
  }

  /** Drop the current stream, if any, and open a new one now. */
  reconnectNow(): void {
    if (this.suspended) return
    window.clearTimeout(this.retryTimer)
    this.retryTimer = 0
    this.attempt = 0
    this.transport?.close()
    this.transport = null
    this.setState('reconnecting')
    this.open()
  }

  private suspend(): void {
    this.suspended = true
    window.clearTimeout(this.retryTimer)
    this.retryTimer = 0
    window.clearInterval(this.watchdog)
    this.transport?.close()
    this.transport = null
  }

  private resume(): void {
    this.suspended = false
    this.reconnectNow()
  }
}

function connection(): Connection {
  const win = window as PlanEventsWindow
  win.__livingPlanConnection ??= new Connection(planEventHub())
  return win.__livingPlanConnection
}

/**
 * Subscribe to the plan event stream. The returned function removes the listener. The stream
 * stays open for the life of the page.
 */
export function subscribePlanEvents(type: string, listener: (event: MessageEvent) => void): () => void {
  // A saved version never changes, so it opens no live stream.
  if (viewingPlanVersion() !== null) return () => {}
  const live = connection()
  live.forward(type)
  live.hub.addEventListener(type, listener as EventListener)
  return () => {
    live.hub.removeEventListener(type, listener as EventListener)
  }
}

/** Follow the connection: `open` once the host is heard, `reconnecting` while it is not. */
export function subscribePlanConnection(listener: (state: PlanConnectionState) => void): () => void {
  if (viewingPlanVersion() !== null) return () => {}
  const live = connection()
  const handler = (event: Event) => listener((event as CustomEvent<{ state: PlanConnectionState }>).detail.state)
  live.hub.addEventListener(CONNECTION_EVENT, handler)
  listener(live.state)
  return () => live.hub.removeEventListener(CONNECTION_EVENT, handler)
}

/** Open the stream now, so listeners the inline page script put on the hub start hearing events. */
export function startPlanEvents(): void {
  if (viewingPlanVersion() !== null) return
  connection()
}
