import { describe, expect, test } from 'bun:test'
import { samplePlanId, sampleSnapshotId } from './protocol'
import { startServer, type SpikeServer } from './index'

type SseEvent = { event: string; data: Record<string, unknown> }

function memoryServer(seed = false): SpikeServer {
  return startServer({ port: 0, dbPath: ':memory:', seed })
}

type PostBody = {
  message?: string
  changed?: boolean
  plan?: { id: string; body: string; headSnapshotId: string }
  snapshot?: { seq: number; reason: string; restoredFromId: string | null } | null
}

async function post(url: string, event: string, data: unknown) {
  const response = await fetch(`${url}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event, data }),
  })
  const body = (await response.json()) as PostBody
  return { status: response.status, body }
}

function openEvents(url: string, signal: AbortSignal): { next: () => Promise<SseEvent>; close: () => void } {
  let cancelStream = () => {}
  const decoder = new TextDecoder()
  let buffer = ''
  const pending: SseEvent[] = []
  let waiter: ((event: SseEvent) => void) | null = null
  let rejecter: ((error: unknown) => void) | null = null
  let stopped = false

  function push(event: SseEvent) {
    if (waiter) {
      const resolve = waiter
      waiter = null
      rejecter = null
      resolve(event)
      return
    }
    pending.push(event)
  }

  function take(raw: string) {
    if (!raw || raw.startsWith(':')) return
    let event = 'message'
    const dataLines: string[] = []
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
    }
    if (dataLines.length === 0) return
    push({ event, data: JSON.parse(dataLines.join('\n')) as Record<string, unknown> })
  }

  function pump(text: string) {
    buffer += text
    let index = buffer.indexOf('\n\n')
    while (index !== -1) {
      take(buffer.slice(0, index))
      buffer = buffer.slice(index + 2)
      index = buffer.indexOf('\n\n')
    }
  }

  const ready = fetch(`${url}/events`, { headers: { accept: 'text/event-stream' }, signal }).then((response) => {
    if (!response.ok || !response.body) throw new Error(`event stream failed: ${response.status}`)
    const streamReader = response.body.getReader()
    cancelStream = () => {
      void streamReader.cancel()
    }
    void (async () => {
      try {
        while (!stopped) {
          const { value, done } = await streamReader.read()
          if (done) break
          pump(decoder.decode(value, { stream: true }))
        }
      } catch (error) {
        if (!stopped && rejecter) rejecter(error)
      }
    })()
  })

  return {
    async next() {
      await ready
      const queued = pending.shift()
      if (queued) return queued
      return new Promise((resolve, reject) => {
        waiter = resolve
        rejecter = reject
      })
    },
    close() {
      stopped = true
      cancelStream()
    },
  }
}

describe('plan snapshots', () => {
  test('seeds a document and its first snapshot', async () => {
    const server = memoryServer(true)
    try {
      const plans = await fetch(`${server.url}/api/plans`)
      const listed = (await plans.json()) as { plans: { id: string; headSnapshotId: string }[] }
      expect(listed.plans.map((plan) => plan.id)).toEqual([samplePlanId])
      expect(listed.plans[0]?.headSnapshotId).toBe(sampleSnapshotId)
      const snapshots = await fetch(`${server.url}/api/plans/${samplePlanId}/snapshots`)
      const history = (await snapshots.json()) as { snapshots: { id: string; seq: number; reason: string }[] }
      expect(history.snapshots).toEqual([
        expect.objectContaining({ id: sampleSnapshotId, seq: 1, reason: 'create' }),
      ])
    } finally {
      await server.stop()
    }
  })

  test('each edit appends a snapshot and restore keeps the older ones', async () => {
    const server = memoryServer(true)
    try {
      const first = await post(server.url, 'edit', { planId: samplePlanId, body: '# Sample plan\n\nVersion two.\n' })
      expect(first.status).toBe(200)
      expect(first.body.changed).toBe(true)
      expect(first.body.snapshot?.seq).toBe(2)
      expect(first.body.snapshot?.reason).toBe('edit')

      const same = await post(server.url, 'edit', { planId: samplePlanId, body: '# Sample plan\n\nVersion two.\n' })
      expect(same.body.changed).toBe(false)
      expect(same.body.snapshot).toBeNull()

      const second = await post(server.url, 'edit', {
        planId: samplePlanId,
        title: 'Renamed plan',
        body: '# Renamed plan\n\nVersion three.\n',
      })
      expect(second.body.snapshot?.seq).toBe(3)

      const restored = await post(server.url, 'restore', { planId: samplePlanId, snapshotId: sampleSnapshotId })
      expect(restored.status).toBe(200)
      expect(restored.body.changed).toBe(true)
      expect(restored.body.plan?.body).toContain('Rate limiting rollout')
      expect(restored.body.plan?.headSnapshotId).not.toBe(sampleSnapshotId)
      expect(restored.body.snapshot?.seq).toBe(4)
      expect(restored.body.snapshot?.reason).toBe('restore')
      expect(restored.body.snapshot?.restoredFromId).toBe(sampleSnapshotId)

      const again = await post(server.url, 'restore', {
        planId: samplePlanId,
        snapshotId: restored.body.plan?.headSnapshotId,
      })
      expect(again.body.changed).toBe(false)

      const history = await fetch(`${server.url}/api/plans/${samplePlanId}/snapshots`)
      const snapshots = (await history.json()) as { snapshots: { seq: number; body: string }[] }
      expect(snapshots.snapshots.map((snapshot) => snapshot.seq)).toEqual([1, 2, 3, 4])
      expect(snapshots.snapshots[1]?.body).toContain('Version two')
      expect(snapshots.snapshots[2]?.body).toContain('Version three')
      expect(snapshots.snapshots[3]?.body).toContain('Rate limiting rollout')
    } finally {
      await server.stop()
    }
  })

  test('a remote edit is pushed on the shared event stream', async () => {
    const server = memoryServer(false)
    const abort = new AbortController()
    const first = openEvents(server.url, abort.signal)
    const second = openEvents(server.url, abort.signal)
    try {
      expect((await first.next()).event).toBe('hello')
      expect((await second.next()).event).toBe('hello')
      const created = await post(server.url, 'create', { title: 'Remote', body: '# Remote\n' })
      expect(created.status).toBe(200)
      const planId = created.body.plan?.id
      if (!planId) throw new Error('create did not return a plan id')

      const seen: string[] = []
      let body = ''
      while (!seen.includes('plan')) {
        const event = await first.next()
        seen.push(event.event)
        if (event.event === 'plan') body = (event.data.plan as { body: string }).body
      }
      expect(seen).toEqual(['create', 'snapshot', 'plan'])
      expect(body).toBe('# Remote\n')

      const edited = await post(server.url, 'edit', { planId, body: '# Remote\n\nEdited from the other side.\n' })
      expect(edited.body.changed).toBe(true)
      let remoteBody = ''
      for (;;) {
        const event = await second.next()
        if (event.event === 'plan') {
          remoteBody = (event.data.plan as { body: string }).body
          if (remoteBody.includes('Edited from the other side')) break
        }
      }
      expect(remoteBody).toContain('Edited from the other side')
    } finally {
      first.close()
      second.close()
      abort.abort()
      await server.stop()
    }
  })

  test('rejects unknown events and missing plans without writing', async () => {
    const server = memoryServer(true)
    try {
      const unknown = await post(server.url, 'comment', { planId: samplePlanId })
      expect(unknown.status).toBe(400)
      const missing = await post(server.url, 'edit', { planId: 'plan_missing', body: 'nope' })
      expect(missing.status).toBe(404)
      const wrongType = await fetch(`${server.url}/events`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: '{}',
      })
      expect(wrongType.status).toBe(415)
      const history = await fetch(`${server.url}/api/plans/${samplePlanId}/snapshots`)
      const snapshots = (await history.json()) as { snapshots: unknown[] }
      expect(snapshots.snapshots).toHaveLength(1)
    } finally {
      await server.stop()
    }
  })
})
