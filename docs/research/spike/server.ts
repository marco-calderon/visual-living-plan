// Spike: a stdio MCP server that turns the plan's agent stream into tools.
// Not product code. It imports the repo's own stream reader so reconnects, pings and hello replay are the CLI's.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { followAgentEvents, type StreamToken } from '../../../src/agentStream.ts'
import { ackPlanEvents, pendingFromHello, planApiUrl, submissionEvent } from '../../../src/agentEvents.ts'
import { defaultRegistryHome, readRegistryLock } from '../../../src/registryLock.ts'
import type { PlanSubmissionEvent } from '../../../src/types.ts'

type Watcher = {
  queue: PlanSubmissionEvent[]
  known: Set<string>
  wake: Set<() => void>
  mode: unknown
  token: StreamToken
  stop: AbortController
  connected: boolean
}

const watchers = new Map<string, Watcher>()

async function serviceToken(): Promise<string | undefined> {
  return (await readRegistryLock(defaultRegistryHome()))?.token
}

/** One background stream per plan, held for the life of this process. It keeps the plan "agent connected" between tool calls. */
async function watcherFor(planUrl: string): Promise<Watcher> {
  const existing = watchers.get(planUrl)
  if (existing) return existing
  const watcher: Watcher = {
    queue: [],
    known: new Set(),
    wake: new Set(),
    mode: null,
    token: { current: await serviceToken() },
    stop: new AbortController(),
    connected: false,
  }
  watchers.set(planUrl, watcher)
  const offer = (rows: PlanSubmissionEvent[]) => {
    for (const row of rows) {
      if (row.deliveredAt != null || watcher.known.has(row.id)) continue
      watcher.known.add(row.id)
      watcher.queue.push(row)
    }
    watcher.queue.sort((a, b) => a.seq - b.seq)
    if (watcher.queue.length) for (const wake of watcher.wake) wake()
  }
  void followAgentEvents(
    planUrl,
    watcher.token,
    (event) => {
      if (event.event === 'hello') {
        watcher.connected = true
        watcher.mode = event.data
        offer(pendingFromHello(event.data))
      } else if (event.event === 'mode') {
        watcher.mode = event.data
      } else if (event.event === 'notice') {
        const row = submissionEvent(event.data)
        if (row) offer([row])
      }
    },
    watcher.stop.signal,
    { retoken: serviceToken },
  ).catch((error) => console.error('stream ended:', error))
  return watcher
}

const server = new McpServer({ name: 'living-plan-spike', version: '0.0.0' })

server.registerTool(
  'wait_for_events',
  {
    description:
      'Block until the person acts on the plan page (answer, verdict, comment, page edit) or the timeout passes. Returns the batch and marks it delivered. Call again after handling it.',
    inputSchema: { planUrl: z.string(), timeoutSeconds: z.number().min(1).max(3600).default(50) },
  },
  async ({ planUrl, timeoutSeconds }, extra) => {
    const watcher = await watcherFor(planUrl)
    const started = Date.now()
    const progressToken = extra._meta?.progressToken
    let ticks = 0
    const heartbeat = progressToken
      ? setInterval(() => {
          ticks += 1
          void extra.sendNotification({
            method: 'notifications/progress',
            params: { progressToken, progress: ticks, message: 'Waiting for the person on the plan page' },
          })
        }, 2_000)
      : undefined
    try {
      if (watcher.queue.length === 0) {
        await new Promise<void>((done) => {
          const finish = () => {
            clearTimeout(timer)
            watcher.wake.delete(finish)
            extra.signal.removeEventListener('abort', finish)
            done()
          }
          const timer = setTimeout(finish, timeoutSeconds * 1000)
          watcher.wake.add(finish)
          extra.signal.addEventListener('abort', finish)
        })
      }
      // A cancelled call returns nothing and acks nothing: the rows stay queued here and pending on the server.
      if (extra.signal.aborted) return { content: [{ type: 'text', text: 'cancelled' }] }
      const batch = watcher.queue.splice(0, watcher.queue.length)
      if (batch.length) {
        try {
          await ackPlanEvents(planUrl, watcher.token.current, batch.map((row) => row.id))
        } catch (error) {
          watcher.queue.unshift(...batch)
          throw error
        }
      }
      const result = {
        timedOut: batch.length === 0,
        waitedMs: Date.now() - started,
        events: batch.map(({ event, id, seq, data }) => ({ event, id, seq, data })),
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result }
    } finally {
      if (heartbeat) clearInterval(heartbeat)
    }
  },
)

async function post(planUrl: string, path: string, body?: unknown) {
  const response = await fetch(planApiUrl(planUrl, path), {
    method: 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${response.status} ${text}`)
  return text ? JSON.parse(text) : {}
}

server.registerTool(
  'reply',
  {
    description: 'Answer a comment from the plan page and mark it answered.',
    inputSchema: { planUrl: z.string(), commentId: z.string(), text: z.string(), keepOpen: z.boolean().default(false) },
  },
  async ({ planUrl, commentId, text, keepOpen }) => {
    const path = `api/comments/${encodeURIComponent(commentId)}`
    await post(planUrl, `${path}/reply`, { text })
    if (!keepOpen) await post(planUrl, `${path}/address`)
    return { content: [{ type: 'text', text: 'replied' }] }
  },
)

server.registerTool(
  'set_mode',
  {
    description: 'Switch the plan page to watch, comment, or review (verdict bar).',
    inputSchema: { planUrl: z.string(), mode: z.enum(['watch', 'comment', 'review']), iteration: z.number().int().min(1).optional() },
  },
  async ({ planUrl, mode, iteration }) => {
    const result = await post(planUrl, 'api/mode', iteration ? { mode, iteration } : { mode })
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  },
)

await server.connect(new StdioServerTransport())
