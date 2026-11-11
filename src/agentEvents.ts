import { cloudCredential, readCloudFile } from './cloudStore'
import type { PlanSubmissionEvent } from './types'

export type AgentEvent = {
  event: string
  data: unknown
}

/** A stored submission row from `hello.pending` or a `notice` event. */
export function submissionEvent(value: unknown): PlanSubmissionEvent | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<PlanSubmissionEvent>
  if (typeof record.id !== 'string' || !record.id) return null
  if (typeof record.seq !== 'number' || !Number.isFinite(record.seq)) return null
  if (record.event !== 'interaction' && record.event !== 'review' && record.event !== 'comment' && record.event !== 'edit') return null
  return {
    id: record.id,
    seq: record.seq,
    event: record.event,
    data: record.data,
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : 0,
    deliveredAt: typeof record.deliveredAt === 'number' ? record.deliveredAt : null,
  }
}

/** Submissions still waiting for the CLI. `delivered_at` is empty on the server. */
export function pendingFromHello(data: unknown): PlanSubmissionEvent[] {
  if (!data || typeof data !== 'object') return []
  const pending = (data as { pending?: unknown }).pending
  if (!Array.isArray(pending)) return []
  return pending.flatMap((entry) => {
    const submission = submissionEvent(entry)
    return submission && submission.deliveredAt == null ? [submission] : []
  })
}

/** Tell the server these submissions were printed. Sets `delivered_at`. */
export async function ackPlanEvents(planUrl: string, token: string | undefined, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  const response = await fetch(planApiUrl(planUrl, 'api/agent-events/ack'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ ids }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Ack failed (${response.status})`)
  }
}

/** Resolve an API path against a plan URL, including `/plans/:id/` on the shared service. */
export function planApiUrl(planUrl: string, apiPath: string): URL {
  const base = planUrl.endsWith('/') ? planUrl : `${planUrl}/`
  return new URL(apiPath.replace(/^\//, ''), base)
}

export function planIdFromPlanUrl(planUrl: string): string | null {
  try {
    const url = new URL(planUrl)
    const match = url.pathname.match(/^\/plans\/([A-Za-z0-9_-]{8,80})(?:\/|$)/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * Submissions the service pushes to one plan's CLI clients.
 * A late client also hears answers already stored in `hello`.
 */
export function planClientNotices(event: AgentEvent): AgentEvent[] {
  if (event.event === 'interaction' || event.event === 'review' || event.event === 'comment' || event.event === 'edit') return [event]
  if (event.event !== 'hello' || !event.data || typeof event.data !== 'object') return []
  const hello = event.data as {
    responses?: Record<string, unknown>
    review?: { decision?: string } | null
    comments?: unknown[]
  }
  const notices: AgentEvent[] = []
  for (const data of Object.values(hello.responses ?? {})) {
    notices.push({ event: 'interaction', data })
  }
  if (hello.review && typeof hello.review === 'object' && hello.review.decision) {
    notices.push({ event: 'review', data: hello.review })
  }
  for (const data of hello.comments ?? []) {
    notices.push({ event: 'comment', data })
  }
  return notices
}

function parseSseChunk(chunk: string): AgentEvent | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of chunk.split('\n')) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return null
  const raw = dataLines.join('\n')
  try {
    return { event, data: JSON.parse(raw) as unknown }
  } catch {
    return { event, data: raw }
  }
}

function agentSocketUrl(planUrl: string): string {
  const url = planApiUrl(planUrl, 'api/agent-events')
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

async function hostedPlanUrl(planUrl: string): Promise<boolean> {
  return cloudCredential(await readCloudFile(), planUrl) !== null
}

/**
 * The host refused the agent stream for a reason a retry does not change: a wrong token, a plan
 * that is not there, or a full account. Reconnecting stops on this error.
 */
export class AgentStreamRefused extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'AgentStreamRefused'
    this.status = status
  }
}

/** Statuses that come back the same on every try. A 5xx or a dropped connection is worth retrying. */
export function refusalIsFinal(status: number): boolean {
  return status === 400 || status === 401 || status === 402 || status === 403 || status === 404 || status === 410
}

/** The hosted object answers this frame itself, so the CLI can tell a live socket from a dead one. */
const SOCKET_PING = 'ping'
const SOCKET_PONG = 'pong'
const SOCKET_PING_MS = 25_000

/** Read hello and notice frames from the hosted plan socket. A `pong` is passed on as a `ping` event. */
async function readAgentSocket(
  planUrl: string,
  token: string | undefined,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const Socket = globalThis.WebSocket
  if (!Socket) throw new Error('This runtime has no WebSocket. Run live-plan with Bun.')
  await new Promise<void>((resolveRead, reject) => {
    const headers = token ? { authorization: `Bearer ${token}` } : undefined
    const socket = new Socket(agentSocketUrl(planUrl), headers ? ({ headers } as unknown as string[]) : undefined)
    let keepAlive: ReturnType<typeof setInterval> | undefined
    let refused: Promise<Error> | null = null
    let settled = false
    // A failed upgrade fires `error` and then `close`. Wait for the reason before the read ends.
    const settle = (error?: Error) => {
      if (settled) return
      settled = true
      if (keepAlive) clearInterval(keepAlive)
      signal.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolveRead()
    }
    const onAbort = () => {
      socket.close()
      settle()
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort)
    socket.addEventListener('open', () => {
      keepAlive = setInterval(() => {
        try {
          socket.send(SOCKET_PING)
        } catch {
          // The close event ends the read.
        }
      }, SOCKET_PING_MS)
    })
    socket.addEventListener('message', (message) => {
      const raw = String(message.data)
      if (raw === SOCKET_PONG) {
        onEvent({ event: 'ping', data: null })
        return
      }
      try {
        const parsed = JSON.parse(raw) as { event?: string; data?: unknown }
        if (parsed.event) onEvent({ event: parsed.event, data: parsed.data })
      } catch {
        // Ignore a frame that is not a plan event.
      }
    })
    socket.addEventListener('error', () => {
      refused ??= socketRefusal(planUrl, token)
      void refused.then(settle)
    })
    socket.addEventListener('close', () => {
      if (refused) void refused.then(settle)
      else settle()
    })
  })
}

/**
 * A refused WebSocket upgrade hides the response body. Ask again over plain HTTP so a refusal the
 * host explains, such as the account's agent limit, reaches the person. Only the Worker answers that
 * request the way it answers the upgrade, so only its 402 counts as final.
 */
async function socketRefusal(planUrl: string, token: string | undefined): Promise<Error> {
  try {
    const response = await fetch(planApiUrl(planUrl, 'api/agent-events'), {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    })
    if (response.status !== 402) return new Error('Agent socket failed')
    return new AgentStreamRefused(402, (await response.text()).trim() || 'This account has no free agent slot.')
  } catch {
    return new Error('Agent socket failed')
  }
}

/** Read the plan service event stream until the signal aborts or the server closes it. */
export async function readAgentEvents(
  planUrl: string,
  token: string | undefined,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  if (await hostedPlanUrl(planUrl)) {
    await readAgentSocket(planUrl, token, onEvent, signal)
    return
  }
  const headers: Record<string, string> = { accept: 'text/event-stream' }
  if (token) headers.authorization = `Bearer ${token}`
  // Bun resets an idle fetch after five minutes. events and watch have to stay open until a person submits or the process is stopped.
  const response = await fetch(planApiUrl(planUrl, 'api/agent-events'), { headers, signal, timeout: false })
  if (!response.ok || !response.body) {
    const text = (await response.text()).trim()
    const message = text || `Agent event stream failed (${response.status})`
    if (refusalIsFinal(response.status)) throw new AgentStreamRefused(response.status, message)
    throw new Error(message)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (!signal.aborted) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let splitAt = buffer.indexOf('\n\n')
    while (splitAt !== -1) {
      const parsed = parseSseChunk(buffer.slice(0, splitAt))
      buffer = buffer.slice(splitAt + 2)
      if (parsed) onEvent(parsed)
      splitAt = buffer.indexOf('\n\n')
    }
  }
}
