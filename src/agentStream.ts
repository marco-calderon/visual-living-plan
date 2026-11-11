import { AgentStreamRefused, readAgentEvents, type AgentEvent } from './agentEvents'

/** A line that has shown it pings, then goes this long without a word, is treated as dead. */
export const STREAM_STALE_MS = 70_000
const STALE_CHECK_MS = 5_000
const MAX_RETRY_DELAY_MS = 30_000
/** Quick retry after a stream that worked closes. Most closes are the service restarting. */
const RECONNECT_AFTER_CLOSE_MS = 1_000
/** A stream that never connected in this process fails after this many tries, so a wrong URL still fails fast. */
export const FIRST_CONNECT_TRIES = 4
/** Failed tries in a row before `revive` is asked to bring the service back. */
const REVIVE_AFTER_FAILURES = 2

/** The bearer the stream and its acks send. `retoken` may replace it after a refusal. */
export type StreamToken = { current: string | undefined }

export type StreamNotices = {
  /**
   * A try failed. Called once per outage, with the wait before the next try. `wasConnected` is false
   * while the stream has not connected once in this process.
   */
  lost?: (reason: string, delayMs: number, wasConnected: boolean) => void
  /** A hello arrived again after `lost`. */
  restored?: () => void
  /** Called once per outage after a few failed tries. Starts a local service that went away. */
  revive?: () => Promise<void>
  /** Called on a 401. A different token is tried at once. The same token, or none, ends the stream. */
  retoken?: () => Promise<string | undefined>
}

/** Wait before try `attempt` (0 based): 1s, 2s, 4s, up to 30s, with a little spread so clients do not reconnect in step. */
export function retryDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_RETRY_DELAY_MS, 1_000 * 2 ** Math.max(0, attempt))
  return Math.round(base * (0.8 + random() * 0.4))
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  return String(error)
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done)
  })
}

/**
 * Read a plan's agent stream until `signal` aborts.
 *
 * A closed stream, a service restart, a crash, or a network change is retried with a growing wait.
 * Every connect starts with a `hello` that carries the submissions still pending on the server, so a
 * gap loses nothing. `ping` frames are swallowed here and only keep the line alive.
 *
 * It throws only for a refusal that a retry does not change (`AgentStreamRefused`), or when the stream
 * never connected in this process after `FIRST_CONNECT_TRIES` tries.
 */
export async function followAgentEvents(
  planUrl: string,
  token: StreamToken,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
  notices: StreamNotices = {},
): Promise<void> {
  let connected = false
  let failures = 0
  let outage = false
  let revived = false

  while (!signal.aborted) {
    const line = new AbortController()
    const stopLine = () => line.abort()
    signal.addEventListener('abort', stopLine, { once: true })
    let heard = false
    let pings = false
    let stale = false
    let lastHeard = Date.now()
    const watchdog = setInterval(() => {
      if (!pings || Date.now() - lastHeard <= STREAM_STALE_MS) return
      stale = true
      line.abort()
    }, STALE_CHECK_MS)
    let reason = 'The plan service closed the stream.'
    let refusal: AgentStreamRefused | null = null

    try {
      await readAgentEvents(
        planUrl,
        token.current,
        (event) => {
          lastHeard = Date.now()
          if (event.event === 'ping') {
            pings = true
            return
          }
          if (event.event === 'hello') {
            heard = true
            connected = true
            failures = 0
            revived = false
            if (outage) {
              outage = false
              notices.restored?.()
            }
          }
          onEvent(event)
        },
        line.signal,
      )
    } catch (error) {
      if (error instanceof AgentStreamRefused) refusal = error
      else reason = errorText(error)
    } finally {
      clearInterval(watchdog)
      signal.removeEventListener('abort', stopLine)
    }
    if (signal.aborted) return
    if (stale) reason = 'No word from the plan service for over a minute.'

    if (refusal) {
      if (refusal.status === 401 && notices.retoken) {
        const next = await notices.retoken().catch(() => undefined)
        if (next && next !== token.current) {
          token.current = next
          continue
        }
      }
      throw refusal
    }

    if (heard) {
      // The line worked and then closed. Try again soon; a failure from here on counts as an outage.
      await pause(RECONNECT_AFTER_CLOSE_MS, signal)
      continue
    }

    failures += 1
    if (!connected && failures >= FIRST_CONNECT_TRIES) throw new Error(reason)
    if (failures >= REVIVE_AFTER_FAILURES && !revived && notices.revive) {
      revived = true
      await notices.revive().catch(() => undefined)
      if (signal.aborted) return
    }
    const delay = retryDelay(failures - 1)
    if (!outage) {
      outage = true
      notices.lost?.(reason, delay, connected)
    }
    await pause(delay, signal)
  }
}
