import assert from 'node:assert/strict'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { planClientNotices, readAgentEvents } from '../src/agentEvents.ts'
import { registerHostedPlan } from '../src/registryClient.ts'
import { startRegistryServer } from '../src/registryService.ts'
import { startLivingPlanServer } from '../src/server.ts'

const planPath = resolve('examples/rate-limit.plan.md')

async function tempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'live-plan-service-'))
}

function choiceBody() {
  return JSON.stringify({
    kind: 'choice',
    id: 'fail-mode',
    optionId: 'open',
    label: 'Fail open',
  })
}

test('hosted plan pushes a form submission to the agent event stream', async () => {
  const home = await tempHome()
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, {
      planPath,
      mode: 'watch',
      cwd: process.cwd(),
    })
    assert.match(hosted.url, /\/plans\/[a-f0-9]{24}\/$/)

    const page = await fetch(hosted.url)
    assert.equal(page.status, 200)
    const html = await page.text()
    assert.match(html, /Rate limiting rollout/)
    assert.match(html, new RegExp(`apiBase = "/plans/${hosted.id}"`))

    const denied = await fetch(new URL('api/agent-events', hosted.url))
    assert.equal(denied.status, 401)

    const seen: Array<{ event: string; data: unknown }> = []
    const controller = new AbortController()
    const reading = readAgentEvents(
      hosted.url,
      hosted.token,
      (event) => {
        seen.push(event)
        if (event.event === 'interaction') controller.abort()
      },
      controller.signal,
    )

    const hello = await new Promise<unknown>((resolveHello, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for hello')), 2_000)
      const poll = setInterval(() => {
        const found = seen.find((event) => event.event === 'hello')
        if (!found) return
        clearInterval(poll)
        clearTimeout(timer)
        resolveHello(found.data)
      }, 20)
    })
    const helloBody = hello as { responses?: Record<string, unknown> }
    assert.equal(helloBody.responses?.['fail-mode'], undefined)

    const posted = await fetch(new URL('api/interactions/fail-mode', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: choiceBody(),
    })
    assert.equal(posted.status, 200)

    await Promise.race([
      reading.catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        throw error
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out waiting for interaction')), 2_000)),
    ])

    const interaction = seen.find((event) => event.event === 'interaction')
    const data = interaction?.data as { id?: string; optionId?: string }
    assert.equal(data?.id, 'fail-mode')
    assert.equal(data?.optionId, 'open')

    const listed = (await (await fetch(new URL('/api/processes', registry.url))).json()) as {
      processes: Array<{ id: string; url: string }>
    }
    assert.equal(listed.processes.some((entry) => entry.id === hosted.id), true)
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('a restarted service restores the submitted response', async () => {
  const home = await tempHome()
  const first = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  const hosted = await registerHostedPlan(first.url, first.token, {
    planPath,
    mode: 'watch',
  })
  const posted = await fetch(new URL('api/interactions/fail-mode', hosted.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: choiceBody(),
  })
  assert.equal(posted.status, 200)
  await first.close()

  const second = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  try {
    const plan = (await (await fetch(new URL(`/plans/${hosted.id}/api/plan`, second.url))).json()) as {
      responses: Record<string, { optionId?: string }>
    }
    assert.equal(plan.responses['fail-mode']?.optionId, 'open')
  } finally {
    await second.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('a private server still serves one plan and its agent stream', async () => {
  const server = await startLivingPlanServer({
    planPath,
    mode: 'watch',
    port: 0,
  })
  try {
    const body = (await (await fetch(new URL('/api/processes', server.url))).json()) as {
      status: string
    }
    assert.equal(body.status, 'disabled')

    const seen: string[] = []
    const controller = new AbortController()
    const reading = readAgentEvents(
      server.url,
      undefined,
      (event) => {
        seen.push(event.event)
        if (event.event === 'interaction') controller.abort()
      },
      controller.signal,
    )
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
    const posted = await fetch(new URL('/api/interactions/fail-mode', server.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: choiceBody(),
    })
    assert.equal(posted.status, 200)
    await Promise.race([
      reading.catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        throw error
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), 2_000)),
    ])
    assert.equal(seen.includes('interaction'), true)
  } finally {
    await server.close()
  }
})

test('a late client hears stored submissions from hello', () => {
  const notices = planClientNotices({
    event: 'hello',
    data: {
      responses: {
        'fail-mode': { id: 'fail-mode', optionId: 'open' },
      },
      review: { decision: 'approve' },
    },
  })
  assert.equal(notices.length, 2)
  assert.equal(notices[0]?.event, 'interaction')
  assert.equal((notices[0]?.data as { optionId?: string }).optionId, 'open')
  assert.equal(notices[1]?.event, 'review')
  assert.deepEqual(planClientNotices({ event: 'reload', data: { at: 1 } }), [])
})

test('the service notifies each client of its own plan', async () => {
  const home = await tempHome()
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  const otherPlan = join(home, 'other.plan.md')
  await copyFile(planPath, otherPlan)
  try {
    const first = await registerHostedPlan(registry.url, registry.token, { planPath, mode: 'watch' })
    const second = await registerHostedPlan(registry.url, registry.token, { planPath: otherPlan, mode: 'watch' })
    assert.notEqual(first.id, second.id)

    const heard: string[][] = [[], [], []]
    const controllers = [new AbortController(), new AbortController(), new AbortController()]
    const urls = [first.url, first.url, second.url]
    const tokens = [first.token, first.token, second.token]
    const readers = urls.map((url, index) =>
      readAgentEvents(
        url,
        tokens[index],
        (event) => {
          if (event.event === 'hello' || event.event === 'interaction') heard[index]?.push(event.event)
          if (event.event === 'interaction') controllers[index]?.abort()
        },
        controllers[index]!.signal,
      ),
    )

    await new Promise<void>((resolveReady, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for clients')), 2_000)
      const poll = setInterval(() => {
        if (!heard.every((events) => events.includes('hello'))) return
        clearInterval(poll)
        clearTimeout(timer)
        resolveReady()
      }, 20)
    })

    const posted = await fetch(new URL('api/interactions/fail-mode', first.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: choiceBody(),
    })
    assert.equal(posted.status, 200)

    await Promise.race([
      Promise.all(
        readers.slice(0, 2).map((reading) =>
          reading.catch((error: unknown) => {
            if (error instanceof Error && error.name === 'AbortError') return
            throw error
          }),
        ),
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out waiting for both clients')), 2_000)),
    ])

    assert.equal(heard[0]?.includes('interaction'), true)
    assert.equal(heard[1]?.includes('interaction'), true)
    assert.equal(heard[2]?.includes('interaction'), false)
    controllers[2]?.abort()
    await readers[2]?.catch((error: unknown) => {
      if (error instanceof Error && error.name === 'AbortError') return
      throw error
    })
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})
