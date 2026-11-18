// Drives the spike server the way a harness would, and plays the person on the page with plain HTTP.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const planUrl = process.argv[2]!
const service = new URL('/', planUrl).toString()
const human = (path: string, body: unknown) =>
  fetch(new URL(path, planUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => {
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
    return r.json() as Promise<any>
  })
const presence = async () => {
  const listed = (await (await fetch(new URL('/api/processes', service))).json()) as any
  const rows = Array.isArray(listed) ? listed : (listed.processes ?? listed.plans ?? [])
  const row = rows.find((p: any) => String(p.url ?? p.siteUrl ?? '').includes(new URL(planUrl).pathname))
  return row ? { agentConnected: row.agentConnected } : { agentConnected: 'row not found', keys: Object.keys(listed) }
}
const parse = (result: any) => result.structuredContent ?? JSON.parse(result.content[0].text)
const log = (label: string, value: unknown) => console.log(`${label}:`, JSON.stringify(value))

const client = new Client({ name: 'spike-client', version: '0.0.0' })
await client.connect(new StdioClientTransport({ command: 'bun', args: [new URL('./server.ts', import.meta.url).pathname], env: process.env as Record<string, string> }))
log('tools', (await client.listTools()).tools.map((t) => t.name))
log('presence before any call', await presence())

// 1. Nothing pending: the call times out on its own and says so.
log('1 timeout', parse(await client.callTool({ name: 'wait_for_events', arguments: { planUrl, timeoutSeconds: 2 } })))
log('1 presence between calls', await presence())

// 2. The person answers a choice while the call blocks.
const t0 = Date.now()
const waiting = client.callTool({ name: 'wait_for_events', arguments: { planUrl, timeoutSeconds: 30 } })
setTimeout(() => void human('api/interactions/fail-mode', { kind: 'choice', id: 'fail-mode', optionId: 'open', label: 'Fail open' }), 1_500)
const got = parse(await waiting)
log('2 answered', { latencyAfterClickMs: Date.now() - t0 - 1_500, events: got.events.map((e: any) => [e.event, e.data?.id ?? e.data?.text]) })

// 3. The harness cancels a call (user pressed Esc). Then the person comments. Nothing is lost.
const abort = new AbortController()
const cancelled = client.callTool({ name: 'wait_for_events', arguments: { planUrl, timeoutSeconds: 30 } }, undefined, { signal: abort.signal }).catch((e) => `rejected: ${e.message}`)
setTimeout(() => abort.abort('user pressed Esc'), 500)
log('3 cancelled call', await cancelled)
const posted = await human('api/comments', { partId: 'design', kind: 'part', text: 'Rename this step to Compile.' })
const after = parse(await client.callTool({ name: 'wait_for_events', arguments: { planUrl, timeoutSeconds: 10 } }))
log('3 next call after cancel', after.events.map((e: any) => [e.event, e.data?.text]))

// 4. Answer the comment through the tool, then read it back from the page API.
await client.callTool({ name: 'reply', arguments: { planUrl, commentId: posted.comment.id, text: 'Renamed.' } })
const plan = (await (await fetch(new URL('api/plan', planUrl))).json()) as any
const comment = (plan.comments ?? plan.session?.comments ?? []).find((c: any) => c.id === posted.comment.id)
log('4 comment after reply', comment ? { addressedAt: Boolean(comment.addressedAt), replies: comment.replies?.length ?? comment.reply } : Object.keys(plan))

// 5. The SDK client's default 60 s request timeout, with no progress reset: the call dies at 60 s and is cancelled.
const t5 = Date.now()
const dead = await client.callTool({ name: 'wait_for_events', arguments: { planUrl, timeoutSeconds: 90 } }).catch((e) => `rejected after ${Math.round((Date.now() - t5) / 1000)}s: ${e.message}`)
log('5 default client timeout', dead)

// 6. Same short client timeout, but the server's progress heartbeat resets it: the call outlives the timeout.
let progress = 0
const t6 = Date.now()
const alive = await client
  .callTool({ name: 'wait_for_events', arguments: { planUrl, timeoutSeconds: 12 } }, undefined, {
    timeout: 5_000,
    resetTimeoutOnProgress: true,
    onprogress: () => (progress += 1),
  })
  .then((r) => ({ ...parse(r), wallSeconds: Math.round((Date.now() - t6) / 1000), progressNotes: progress }))
  .catch((e) => `rejected: ${e.message}`)
log('6 progress keeps a 5 s client timeout alive for 12 s', alive)

await client.close()
