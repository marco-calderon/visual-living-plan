export type AgentEvent = {
  event: string
  data: unknown
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
