import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { pendingFromHello, planClientNotices, readAgentEvents, submissionEvent } from '../src/agentEvents.ts'
import { registryDatabasePath } from '../src/registryLock.ts'
import { registerHostedPlan } from '../src/registryClient.ts'
import { startRegistryServer } from '../src/registryService.ts'
import { openRegistryStore } from '../src/registryStore.ts'
import { startLivingPlanServer } from '../src/server.ts'
import type { PlanSubmissionEvent } from '../src/types.ts'

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

test('a plan comment reaches the agent and can be addressed', async () => {
  const home = await tempHome()
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, {
      planPath,
      mode: 'watch',
      cwd: process.cwd(),
    })
    const seen: Array<{ event: string; data: unknown }> = []
    const controller = new AbortController()
    const reading = readAgentEvents(
      hosted.url,
      hosted.token,
      (event) => {
        seen.push(event)
        if (event.event === 'comment' && (event.data as { addressedAt?: number | null }).addressedAt) {
          controller.abort()
        }
      },
      controller.signal,
    )
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 40))

    const posted = await fetch(new URL('api/comments', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        partId: 'phase:implement/paragraph:1',
        kind: 'paragraph',
        blockId: 'implement',
        excerpt: 'Wire the limiter',
        text: 'Default the flag on in staging.',
      }),
    })
    assert.equal(posted.status, 200)
    const created = (await posted.json()) as { comment: { id: string; addressedAt: number | null } }
    assert.match(created.comment.id, /^cmt_/)
    assert.equal(created.comment.addressedAt, null)

    const addressed = await fetch(new URL(`api/comments/${created.comment.id}/address`, hosted.url), {
      method: 'POST',
    })
    assert.equal(addressed.status, 200)

    await Promise.race([
      reading.catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        throw error
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out waiting for comment')), 2_000)),
    ])

    const open = seen.find(
      (event) => event.event === 'comment' && (event.data as { addressedAt?: number | null }).addressedAt == null,
    )
    const closed = seen.find(
      (event) => event.event === 'comment' && (event.data as { addressedAt?: number | null }).addressedAt,
    )
    assert.equal((open?.data as { text?: string }).text, 'Default the flag on in staging.')
    assert.equal(typeof (closed?.data as { addressedAt?: number }).addressedAt, 'number')

    await registry.close()
    const restored = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
    try {
      const plan = (await (await fetch(new URL(`/plans/${hosted.id}/api/plan`, restored.url))).json()) as {
        comments: Array<{ id: string; addressedAt: number | null }>
      }
      assert.equal(plan.comments[0]?.id, created.comment.id)
      assert.equal(typeof plan.comments[0]?.addressedAt, 'number')
    } finally {
      await restored.close()
    }
  } finally {
    await registry.close().catch(() => undefined)
    await rm(home, { recursive: true, force: true })
  }
})

test('an agent reply is recorded in the registry and broadcast to the page', async () => {
  const home = await tempHome()
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, {
      planPath,
      mode: 'review',
      cwd: process.cwd(),
    })

    const componentPosted = await fetch(new URL('api/comments', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        partId: 'phase:implement/paragraph:1',
        kind: 'paragraph',
        blockId: 'implement',
        excerpt: 'Wire the limiter',
        text: 'Default the flag on in staging.',
      }),
    })
    assert.equal(componentPosted.status, 200)
    const component = (await componentPosted.json()) as { comment: { id: string } }

    const minibarPosted = await fetch(new URL('api/comments', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        partId: 'review:message',
        kind: 'message',
        text: 'Leave the approval bar up.',
      }),
    })
    assert.equal(minibarPosted.status, 200)
    const minibar = (await minibarPosted.json()) as { comment: { id: string } }

    const pendingBefore = await helloPending(hosted.url, hosted.token)
    assert.equal(pendingBefore.length, 2)

    const seen: string[] = []
    const controller = new AbortController()
    let ready = false
    const reading = readAgentEvents(
      hosted.url,
      hosted.token,
      (event) => {
        if (event.event === 'hello') {
          ready = true
          return
        }
        if (event.event !== 'comment') return
        const replies = (event.data as { replies?: Array<{ text?: string }> }).replies
        if (!replies?.length) return
        const text = replies[replies.length - 1]?.text
        if (text) seen.push(text)
        if (seen.length >= 2) controller.abort()
      },
      controller.signal,
    )
    await new Promise<void>((resolveReady, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for the reply client')), 2_000)
      const poll = setInterval(() => {
        if (!ready) return
        clearInterval(poll)
        clearTimeout(timer)
        resolveReady()
      }, 20)
    })

    const componentReply = await fetch(new URL(`api/comments/${component.comment.id}/reply`, hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'The flag stays on in staging.' }),
    })
    assert.equal(componentReply.status, 200)
    const componentBody = (await componentReply.json()) as {
      reply: { id: string; text: string; createdAt: number }
      comment: { replies: Array<{ id: string; text: string }> }
    }
    assert.match(componentBody.reply.id, /^rpl_/)
    assert.equal(componentBody.reply.text, 'The flag stays on in staging.')
    assert.equal(typeof componentBody.reply.createdAt, 'number')
    assert.equal(componentBody.comment.replies[0]?.id, componentBody.reply.id)

    const minibarReply = await fetch(new URL(`api/comments/${minibar.comment.id}/reply`, hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'The verdict bar stays while I answer.' }),
    })
    assert.equal(minibarReply.status, 200)

    const missing = await fetch(new URL('api/comments/cmt_missing/reply', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Nope' }),
    })
    assert.equal(missing.status, 404)
    const empty = await fetch(new URL(`api/comments/${component.comment.id}/reply`, hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: '   ' }),
    })
    assert.equal(empty.status, 400)

    await Promise.race([
      reading.catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        throw error
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out waiting for replies')), 2_000)),
    ])
    assert.deepEqual(seen.sort(), ['The flag stays on in staging.', 'The verdict bar stays while I answer.'].sort())

    const pendingAfter = await helloPending(hosted.url, hosted.token)
    assert.equal(pendingAfter.length, pendingBefore.length)
    assert.equal(
      pendingAfter.some((event) => JSON.stringify(event.data).includes('rpl_')),
      false,
    )

    const page = await fetch(hosted.url)
    assert.match(await page.text(), /The flag stays on in staging\./)

    await registry.close()
    const store = await openRegistryStore(registryDatabasePath(home))
    try {
      const session = store.getSession(hosted.id)
      const stored = JSON.parse(session?.commentsJson ?? '[]') as Array<{
        id: string
        kind: string
        partId: string
        replies?: Array<{ id: string; text: string }>
      }>
      const onPart = stored.find((comment) => comment.id === component.comment.id)
      const onTray = stored.find((comment) => comment.id === minibar.comment.id)
      assert.equal(onPart?.kind, 'paragraph')
      assert.equal(onPart?.replies?.[0]?.text, 'The flag stays on in staging.')
      assert.match(onPart?.replies?.[0]?.id ?? '', /^rpl_/)
      assert.equal(onTray?.partId, 'review:message')
      assert.equal(onTray?.replies?.[0]?.text, 'The verdict bar stays while I answer.')
      assert.equal(
        store.listEvents(hosted.id).some((event) => JSON.stringify(event.data).includes('rpl_')),
        false,
      )
    } finally {
      store.close()
    }

    const restored = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
    try {
      const plan = (await (await fetch(new URL(`/plans/${hosted.id}/api/plan`, restored.url))).json()) as {
        comments: Array<{ id: string; replies?: Array<{ text: string }> }>
      }
      assert.equal(
        plan.comments.find((comment) => comment.id === component.comment.id)?.replies?.[0]?.text,
        'The flag stays on in staging.',
      )
      assert.equal(
        plan.comments.find((comment) => comment.id === minibar.comment.id)?.replies?.[0]?.text,
        'The verdict bar stays while I answer.',
      )
    } finally {
      await restored.close()
    }
  } finally {
    await registry.close().catch(() => undefined)
    await rm(home, { recursive: true, force: true })
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
      comments: [{ id: 'cmt_test', text: 'Look here' }],
    },
  })
  assert.equal(notices.length, 3)
  assert.equal(notices[2]?.event, 'comment')
  assert.equal((notices[2]?.data as { text?: string }).text, 'Look here')
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

test('serve prints a plan comment on stdout as soon as it is sent', async () => {
  const child = spawn(
    process.execPath,
    ['src/cli.ts', 'serve', planPath, '--no-registry', '--no-open', '--port', '0'],
    { cwd: resolve('.'), stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let output = ''
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    output += chunk
  })
  child.stderr?.on('data', (chunk: string) => {
    output += chunk
  })
  const kill = () => {
    if (child.exitCode === null && !child.killed) child.kill('SIGINT')
  }
  try {
    const url = await new Promise<string>((resolveUrl, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for serve\n${output}`)), 8_000)
      const check = () => {
        const match = output.match(/Living Plan \(watch\): (http:\/\/\S+)/)
        if (!match?.[1]) return
        clearTimeout(timer)
        child.stdout?.off('data', check)
        resolveUrl(match[1])
      }
      child.stdout?.on('data', check)
      check()
    })

    const posted = await fetch(new URL('/api/comments', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        partId: 'phase:implement/paragraph:1',
        kind: 'paragraph',
        blockId: 'implement',
        excerpt: 'Wire the limiter',
        text: 'Send this to the agent now.',
      }),
    })
    assert.equal(posted.status, 200)

    await new Promise<void>((resolveNotice, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out waiting for comment on stdout\n${output}`)),
        4_000,
      )
      const check = () => {
        if (!output.includes('Send this to the agent now.')) return
        clearTimeout(timer)
        child.stdout?.off('data', check)
        resolveNotice()
      }
      child.stdout?.on('data', check)
      check()
    })
    assert.match(output, /"event":"comment"/)
  } finally {
    kill()
    await new Promise((resolveExit) => {
      if (child.exitCode !== null) resolveExit(child.exitCode)
      else child.once('exit', resolveExit)
    })
  }
})

function parseSseChunk(chunk: string): { event: string; data: unknown } | null {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of chunk.split('\n')) {
    if (!line || line.startsWith(':')) continue
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return null
  return { event, data: JSON.parse(dataLines.join('\n')) as unknown }
}

async function readBrowserEvents(
  url: string,
  onEvent: (event: { event: string; data: unknown }) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(url, { headers: { accept: 'text/event-stream' }, signal })
  if (!response.ok || !response.body) throw new Error(await response.text())
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

function waitForEvent(
  seen: Array<{ event: string; data: unknown }>,
  match: (event: { event: string; data: unknown }) => boolean,
): Promise<{ event: string; data: unknown }> {
  return new Promise((resolveEvent, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for event')), 2_000)
    const poll = setInterval(() => {
      const found = seen.find(match)
      if (!found) return
      clearInterval(poll)
      clearTimeout(timer)
      resolveEvent(found)
    }, 20)
  })
}

test('mode changes stay on the open session and iterate keeps review open', async () => {
  const home = await tempHome()
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  const controller = new AbortController()
  const lateController = new AbortController()
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, {
      planPath,
      mode: 'watch',
    })
    const seen: Array<{ event: string; data: unknown }> = []
    let sawIterate = false
    const reading = readBrowserEvents(
      new URL('api/events', hosted.url).href,
      (event) => {
        seen.push(event)
        if (event.event === 'review' && (event.data as { decision?: string }).decision === 'iterate') {
          sawIterate = true
        }
        if (sawIterate && event.event === 'mode') controller.abort()
      },
      controller.signal,
    )

    const hello = await waitForEvent(seen, (event) => event.event === 'hello')
    assert.equal((hello.data as { mode?: string }).mode, 'watch')

    const commentMode = await fetch(new URL('api/mode', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'comment' }),
    })
    assert.equal(commentMode.status, 200)
    const invalid = await fetch(new URL('api/mode', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'edit' }),
    })
    assert.equal(invalid.status, 400)

    const commented = await fetch(new URL('api/comments', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        partId: 'phase:implement/paragraph:1',
        kind: 'paragraph',
        text: 'Stay in comment mode',
      }),
    })
    assert.equal(commented.status, 200)
    const afterComment = (await (await fetch(new URL('api/plan', hosted.url))).json()) as { mode?: string }
    assert.equal(afterComment.mode, 'comment')

    const again = await registerHostedPlan(registry.url, registry.token, { planPath, mode: 'watch' })
    assert.equal(again.mode, 'comment')

    const late: Array<{ event: string; data: unknown }> = []
    const lateReading = readBrowserEvents(
      new URL('api/events', hosted.url).href,
      (event) => {
        late.push(event)
        if (event.event === 'hello') lateController.abort()
      },
      lateController.signal,
    )
    const lateHello = await waitForEvent(late, (event) => event.event === 'hello')
    assert.equal((lateHello.data as { mode?: string }).mode, 'comment')
    await lateReading.catch((error: unknown) => {
      if (error instanceof Error && error.name === 'AbortError') return
      throw error
    })

    const reviewMode = await fetch(new URL('api/mode', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'review' }),
    })
    assert.equal(reviewMode.status, 200)
    const reviewing = await (await fetch(hosted.url)).text()
    assert.match(reviewing, /data-plan-mode="review"/)
    assert.match(reviewing, /id="review-dock" class="review-dock">/)

    const decision = await fetch(new URL('api/review', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'iterate', note: 'next' }),
    })
    assert.equal(decision.status, 200)

    await reading.catch((error: unknown) => {
      if (error instanceof Error && error.name === 'AbortError') return
      throw error
    })

    const after = (await (await fetch(new URL('api/plan', hosted.url))).json()) as {
      mode?: string
      review?: { decision?: string; comments?: Array<{ text?: string }> }
      comments?: Array<{ text?: string; addressingAt?: number | null; addressedAt?: number | null }>
    }
    assert.equal(after.mode, 'review')
    assert.equal(after.review?.decision, 'iterate')
    assert.equal(after.review?.comments?.[0]?.text, 'Stay in comment mode')
    assert.equal(typeof after.comments?.[0]?.addressingAt, 'number')
    assert.equal(after.comments?.[0]?.addressedAt, null)
    const watching = await (await fetch(hosted.url)).text()
    assert.match(watching, /data-plan-mode="review"/)
    assert.match(watching, /id="review-dock" class="review-dock" hidden/)
    assert.match(watching, /data-decision="iterate"/)
    assert.match(watching, /data-review-value>iterate/)

    const more = await fetch(new URL('api/comments', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        partId: 'phase:implement/paragraph:1',
        kind: 'paragraph',
        text: 'Add one more while the first is in progress',
      }),
    })
    assert.equal(more.status, 200)
    const later = (await (await fetch(new URL('api/plan', hosted.url))).json()) as {
      comments?: Array<{ text?: string; addressingAt?: number | null }>
    }
    assert.equal(later.comments?.length, 2)
    assert.equal(later.comments?.[1]?.addressingAt, null)

    const listed = (await (await fetch(new URL('/api/processes', registry.url))).json()) as {
      processes: Array<{ id: string }>
    }
    assert.equal(listed.processes.some((entry) => entry.id === hosted.id), true)
    assert.deepEqual(
      seen.filter((event) => event.event === 'mode').map((event) => (event.data as { mode?: string }).mode),
      ['comment', 'review', 'review'],
    )
  } finally {
    controller.abort()
    lateController.abort()
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

async function helloPending(url: string, token: string): Promise<PlanSubmissionEvent[]> {
  const controller = new AbortController()
  const pending = new Promise<PlanSubmissionEvent[]>((resolvePending, reject) => {
    const timer = setTimeout(() => {
      controller.abort()
      reject(new Error('timed out waiting for hello'))
    }, 2_000)
    void readAgentEvents(
      url,
      token,
      (event) => {
        if (event.event !== 'hello') return
        clearTimeout(timer)
        resolvePending(pendingFromHello(event.data))
        controller.abort()
      },
      controller.signal,
    ).catch((error: unknown) => {
      if (error instanceof Error && error.name === 'AbortError') return
      reject(error)
    })
  })
  return pending
}

test('undelivered submissions survive reconnect until the CLI acks', async () => {
  const home = await tempHome()
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, {
      planPath,
      mode: 'watch',
      cwd: process.cwd(),
    })

    const comment = await fetch(new URL('api/comments', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        partId: 'phase:implement/paragraph:1',
        kind: 'paragraph',
        text: 'Ship the flag on.',
      }),
    })
    assert.equal(comment.status, 200)
    const created = (await comment.json()) as { comment: { id: string } }
    const choice = await fetch(new URL('api/interactions/fail-mode', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: choiceBody(),
    })
    assert.equal(choice.status, 200)

    const pending = await helloPending(hosted.url, hosted.token)
    assert.equal(pending.length, 2)
    assert.deepEqual(
      pending.map((event) => event.event),
      ['comment', 'interaction'],
    )
    assert.equal(pending.every((event) => event.deliveredAt == null), true)

    const denied = await fetch(new URL('api/agent-events/ack', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: pending.map((event) => event.id) }),
    })
    assert.equal(denied.status, 401)

    const acked = await fetch(new URL('api/agent-events/ack', hosted.url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${hosted.token}`,
      },
      body: JSON.stringify({ ids: pending.map((event) => event.id) }),
    })
    assert.equal(acked.status, 200)
    assert.deepEqual(await helloPending(hosted.url, hosted.token), [])

    const addressed = await fetch(new URL(`api/comments/${created.comment.id}/address`, hosted.url), {
      method: 'POST',
    })
    assert.equal(addressed.status, 200)
    assert.deepEqual(await helloPending(hosted.url, hosted.token), [])

    const seen: Array<{ event: string; data: unknown }> = []
    const controller = new AbortController()
    const reading = readAgentEvents(
      hosted.url,
      hosted.token,
      (event) => {
        seen.push(event)
        if (event.event === 'notice') controller.abort()
      },
      controller.signal,
    )
    await new Promise<void>((resolveReady, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for the live client')), 2_000)
      const poll = setInterval(() => {
        if (!seen.some((event) => event.event === 'hello')) return
        clearInterval(poll)
        clearTimeout(timer)
        resolveReady()
      }, 20)
    })
    const live = await fetch(new URL('api/comments', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        partId: 'phase:design/paragraph:1',
        kind: 'paragraph',
        text: 'Queued after the client left.',
      }),
    })
    assert.equal(live.status, 200)
    await Promise.race([
      reading.catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        throw error
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out waiting for notice')), 2_000)),
    ])
    const notice = submissionEvent(seen.find((event) => event.event === 'notice')?.data)
    assert.equal(notice?.event, 'comment')
    assert.equal((notice?.data as { text?: string }).text, 'Queued after the client left.')
    assert.equal((notice?.data as { addressedAt?: number | null }).addressedAt, null)

    const mode = await fetch(new URL('api/mode', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'review' }),
    })
    assert.equal(mode.status, 200)
    const denial = await fetch(new URL('api/review', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'deny', note: 'Not yet' }),
    })
    assert.equal(denial.status, 200)

    const waiting = await helloPending(hosted.url, hosted.token)
    assert.equal(waiting.length, 2)
    assert.equal(waiting[0]?.id, notice?.id)
    assert.equal(waiting[1]?.event, 'review')
    assert.equal((waiting[1]?.data as { decision?: string }).decision, 'deny')

    const reviewAck = await fetch(new URL('api/agent-events/ack', hosted.url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${registry.token}`,
      },
      body: JSON.stringify({ ids: [waiting[1]?.id] }),
    })
    assert.equal(reviewAck.status, 200)

    await registry.close()
    const store = await openRegistryStore(registryDatabasePath(home))
    try {
      const stored = store.listEvents(hosted.id)
      assert.equal(stored.length, 4)
      assert.equal(stored.filter((event) => event.deliveredAt == null).map((event) => event.id).join(','), notice?.id)
      assert.equal(stored.filter((event) => event.event === 'review')[0]?.deliveredAt == null, false)
    } finally {
      store.close()
    }

    const restored = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
    try {
      const again = await helloPending(new URL(`/plans/${hosted.id}/`, restored.url).href, 'test-token-value')
      assert.equal(again.length, 1)
      assert.equal(again[0]?.id, notice?.id)
      assert.equal((again[0]?.data as { text?: string }).text, 'Queued after the client left.')
    } finally {
      await restored.close()
    }
  } finally {
    await registry.close().catch(() => undefined)
    await rm(home, { recursive: true, force: true })
  }
})

test('watch stays in watch mode and keeps running after a comment', async () => {
  const home = await tempHome()
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  let output = ''
  let watching: ReturnType<typeof spawn> | undefined
  const stop = () => {
    if (watching && watching.exitCode === null && !watching.killed) watching.kill('SIGINT')
  }
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, {
      planPath,
      mode: 'review',
      cwd: process.cwd(),
    })
    watching = spawn(process.execPath, ['src/cli.ts', 'watch', '--url', hosted.url], {
      cwd: resolve('.'),
      env: { ...process.env, LIVE_PLAN_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    watching.stdout?.setEncoding('utf8')
    watching.stderr?.setEncoding('utf8')
    watching.stdout?.on('data', (chunk: string) => {
      output += chunk
    })
    watching.stderr?.on('data', (chunk: string) => {
      output += chunk
    })

    const started = Date.now()
    while (!output.includes('Watching plan execution') && Date.now() - started < 8_000) {
      if (watching.exitCode !== null) break
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 30))
    }
    assert.match(output, /Watching plan execution/)
    const page = await (await fetch(hosted.url)).text()
    assert.match(page, /data-plan-mode="watch"/)

    const posted = await fetch(new URL('api/comments', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        partId: 'phase:design/paragraph:1',
        kind: 'paragraph',
        text: 'Noted during execution.',
      }),
    })
    assert.equal(posted.status, 200)
    const printed = Date.now()
    while (!output.includes('Noted during execution.') && Date.now() - printed < 4_000) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 30))
    }
    assert.match(output, /"event":"comment"/)
    assert.match(output, /Noted during execution\./)
    assert.equal(watching.exitCode, null)

    const quiet = Date.now()
    while (Date.now() - quiet < 250) {
      assert.equal(watching.exitCode, null)
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 40))
    }

    const pending = await helloPending(hosted.url, hosted.token)
    assert.deepEqual(pending, [])
  } finally {
    stop()
    if (watching) {
      await new Promise((resolveExit) => {
        if (watching?.exitCode !== null) resolveExit(watching.exitCode)
        else watching?.once('exit', resolveExit)
      })
    }
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

function runCli(home: string, args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveExit) => {
    const child = spawn(process.execPath, ['src/cli.ts', ...args], {
      cwd: resolve('.'),
      env: { ...process.env, LIVE_PLAN_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000)
    child.once('exit', (status) => {
      clearTimeout(timer)
      resolveExit({ status, stdout, stderr })
    })
  })
}

test('addressing, reply, and address move a comment from reviewing to answered', { timeout: 30_000 }, async () => {
  const home = await tempHome()
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, {
      planPath,
      mode: 'watch',
      cwd: process.cwd(),
    })
    const posted = await fetch(new URL('api/comments', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        partId: 'review:message',
        kind: 'message',
        text: 'Is the flag on in staging?',
      }),
    })
    assert.equal(posted.status, 200)
    const created = (await posted.json()) as { comment: { id: string } }

    const missing = await runCli(home, ['addressing'])
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /Usage: live-plan addressing/)

    const badOutcome = await runCli(home, ['address', created.comment.id, '--url', hosted.url, '--outcome', 'done'])
    assert.equal(badOutcome.status, 1)
    assert.match(badOutcome.stderr, /--outcome implemented\|errored\|issues/)

    const reviewing = await runCli(home, ['addressing', created.comment.id, '--url', hosted.url])
    assert.equal(reviewing.status, 0, reviewing.stderr)
    const reviewingBody = JSON.parse(reviewing.stdout) as {
      comment: { addressingAt: number | null; addressedAt: number | null }
    }
    assert.equal(typeof reviewingBody.comment.addressingAt, 'number')
    assert.equal(reviewingBody.comment.addressedAt, null)

    const again = await runCli(home, ['addressing', created.comment.id, '--url', hosted.url])
    assert.equal(again.status, 0, again.stderr)
    const againBody = JSON.parse(again.stdout) as { comment: { addressingAt: number | null } }
    assert.equal(againBody.comment.addressingAt, reviewingBody.comment.addressingAt)

    const reply = await runCli(home, [
      'reply',
      created.comment.id,
      '--url',
      hosted.url,
      '--text',
      'Yes. Staging defaults the flag on.',
    ])
    assert.equal(reply.status, 0, reply.stderr)
    const replyBody = JSON.parse(reply.stdout) as {
      reply: { text: string }
      comment: { addressingAt: number | null; replies: Array<{ text: string }> }
    }
    assert.equal(replyBody.reply.text, 'Yes. Staging defaults the flag on.')
    assert.equal(replyBody.comment.replies[0]?.text, 'Yes. Staging defaults the flag on.')
    assert.equal(typeof replyBody.comment.addressingAt, 'number')

    const answered = await runCli(home, ['address', created.comment.id, '--url', hosted.url, '--outcome', 'implemented'])
    assert.equal(answered.status, 0, answered.stderr)
    const answeredBody = JSON.parse(answered.stdout) as {
      comment: { addressingAt: number | null; addressedAt: number | null; outcome?: string }
    }
    assert.equal(answeredBody.comment.addressingAt, null)
    assert.equal(typeof answeredBody.comment.addressedAt, 'number')
    assert.equal(answeredBody.comment.outcome, 'implemented')

    const plan = (await (await fetch(new URL('api/plan', hosted.url))).json()) as {
      comments: Array<{
        id: string
        addressingAt: number | null
        addressedAt: number | null
        outcome?: string
        replies?: Array<{ text: string }>
      }>
    }
    const stored = plan.comments.find((comment) => comment.id === created.comment.id)
    assert.equal(stored?.addressingAt, null)
    assert.equal(typeof stored?.addressedAt, 'number')
    assert.equal(stored?.outcome, 'implemented')
    assert.equal(stored?.replies?.[0]?.text, 'Yes. Staging defaults the flag on.')
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})
