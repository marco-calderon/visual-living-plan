import type { PlanSubmissionEvent } from './types.js'

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
  if (record.event !== 'interaction' && record.event !== 'review' && record.event !== 'comment') return null
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
  if (event.event === 'interaction' || event.event === 'review' || event.event === 'comment') return [event]
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

/** Read the plan service event stream until the signal aborts or the server closes it. */
export async function readAgentEvents(
  planUrl: string,
  token: string | undefined,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = { accept: 'text/event-stream' }
  if (token) headers.authorization = `Bearer ${token}`
  const response = await fetch(planApiUrl(planUrl, 'api/agent-events'), { headers, signal })
  if (!response.ok || !response.body) {
    const text = await response.text()
    throw new Error(text || `Agent event stream failed (${response.status})`)
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
