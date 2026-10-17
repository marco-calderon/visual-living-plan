import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readAgentEvents } from '../src/agentEvents.ts'

test('the agent event stream disables Bun’s idle timeout', async () => {
  const original = globalThis.fetch
  let timeout: unknown = 'unset'
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    timeout = (init as { timeout?: unknown } | undefined)?.timeout
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: hello\ndata: {"pending":[]}\n\n'))
        controller.close()
      },
    })
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }) as typeof fetch
  try {
    const controller = new AbortController()
    await readAgentEvents('http://127.0.0.1:9/plans/x/', undefined, () => {}, controller.signal)
  } finally {
    globalThis.fetch = original
  }
  assert.equal(timeout, false)
})
