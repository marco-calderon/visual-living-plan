import { serverEventNames, type ClientEventName, type CreateEventData, type EditEventData, type PostEventsResponse, type RestoreEventData } from '../../server/protocol'
import { emptyStreamState, reducePlanStream, type StreamState } from './reducePlanStream'

type ConnectionListener = (connected: boolean) => void
type EventListener = (data: unknown) => void

const listeners = new Map<string, Set<EventListener>>()
const connectionListeners = new Set<ConnectionListener>()
let source: EventSource | null = null
let latest: StreamState = emptyStreamState
let releaseBound = false

export function currentPlanState(): StreamState {
  return latest
}

export function subscribePlanEvents(event: string, listener: EventListener): () => void {
  ensurePlanEvents()
  let bucket = listeners.get(event)
  if (!bucket) {
    bucket = new Set()
    listeners.set(event, bucket)
  }
  bucket.add(listener)
  return () => {
    bucket.delete(listener)
  }
}

export function subscribePlanConnection(listener: ConnectionListener): () => void {
  ensurePlanEvents()
  connectionListeners.add(listener)
  listener(source?.readyState === EventSource.OPEN)
  return () => {
    connectionListeners.delete(listener)
  }
}

export async function postPlanEvent(
  event: ClientEventName,
  data: CreateEventData | EditEventData | RestoreEventData,
): Promise<PostEventsResponse> {
  const response = await fetch('/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ event, data }),
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.message === 'string' ? payload.message : `Request failed (${response.status})`
    throw new Error(message)
  }
  if (!isPostResponse(payload)) throw new Error('Unexpected response')
  return payload
}

/**
 * One EventSource for the page. React cleanup removes listeners and leaves the stream open.
 * The browser closes it on pagehide so a reload does not keep the previous connection.
 */
function ensurePlanEvents(): EventSource {
  if (source && source.readyState !== EventSource.CLOSED) return source
  const next = new EventSource('/events')
  source = next
  for (const event of serverEventNames) {
    next.addEventListener(event, (message) => {
      const data = parseData(message)
      if (data === undefined) return
      latest = reducePlanStream(latest, event, data)
      const bucket = listeners.get(event)
      if (!bucket) return
      for (const listener of [...bucket]) listener(data)
    })
  }
  next.onopen = () => notifyConnection(true)
  next.onerror = () => notifyConnection(false)
  bindRelease(next)
  return next
}

function bindRelease(next: EventSource): void {
  if (releaseBound) return
  releaseBound = true
  const release = () => {
    if (source !== next) return
    next.close()
    source = null
    releaseBound = false
  }
  window.addEventListener('pagehide', release)
  window.addEventListener('beforeunload', release)
}

function notifyConnection(connected: boolean): void {
  for (const listener of [...connectionListeners]) listener(connected)
}

function parseData(message: Event): unknown {
  if (!(message instanceof MessageEvent) || typeof message.data !== 'string') return undefined
  try {
    return JSON.parse(message.data) as unknown
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPostResponse(value: unknown): value is PostEventsResponse {
  return isRecord(value) && value.ok === true && typeof value.changed === 'boolean' && isRecord(value.plan)
}
