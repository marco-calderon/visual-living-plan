import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { pendingFromHello } from '../src/agentEvents.ts'
import { ensureRegistry, registerHostedPlan, registryBindUrl, reviveRegistry, stopRegistry } from '../src/registryClient.ts'
import { readRegistryLock } from '../src/registryLock.ts'
import { startRegistryServer } from '../src/registryService.ts'

const planPath = resolve('examples/rate-limit.plan.md')
const entry = fileURLToPath(new URL('../src/cli.ts', import.meta.url))

async function tempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'live-plan-stream-'))
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

type Running = {
  child: ChildProcess
  output: () => string
  stdout: () => string
  waitFor: (pattern: RegExp, timeoutMs?: number) => Promise<void>
  exited: () => Promise<number | null>
  stop: () => Promise<void>
}

/** Start a CLI command that keeps running, and collect what it prints. */
function startCli(home: string, args: string[]): Running {
  const child = spawn(process.execPath, ['src/cli.ts', ...args], {
    cwd: resolve('.'),
    env: { ...process.env, LIVE_PLAN_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let all = ''
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    stdout += chunk
    all += chunk
  })
  child.stderr?.on('data', (chunk: string) => {
    all += chunk
  })
  const exit = new Promise<number | null>((resolveExit) => child.once('exit', (code) => resolveExit(code)))
  return {
    child,
    output: () => all,
    stdout: () => stdout,
    async waitFor(pattern, timeoutMs = 10_000) {
      const started = Date.now()
      while (!pattern.test(all)) {
        if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${pattern}. Output:\n${all}`)
        if (child.exitCode !== null) throw new Error(`Exited ${child.exitCode} before ${pattern}. Output:\n${all}`)
        await delay(40)
      }
    },
    exited: () => exit,
    async stop() {
      if (child.exitCode === null && !child.killed) child.kill('SIGINT')
      await exit
    },
  }
}

async function runCli(home: string, args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const running = startCli(home, args)
  const timer = setTimeout(() => running.child.kill('SIGKILL'), 15_000)
  const status = await running.exited()
  clearTimeout(timer)
  const stdout = running.stdout()
  return { status, stdout, stderr: running.output().slice(stdout.length) }
}

/**
 * Wait until the served page reports an agent stream, so a listener has its first hello. Read the
 * `<body>` attribute: the page's CSS also has `body[data-agent="connected"]` in it.
 */
async function waitForAgent(url: string, timeoutMs = 8_000): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const page = await (await fetch(url)).text()
    if (/<body[^>]*\sdata-agent="connected"/.test(page)) return
    await delay(50)
  }
  throw new Error('No agent stream connected')
}

async function postComment(url: string, text: string): Promise<Response> {
  return fetch(new URL('api/comments', url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ partId: 'phase:design/paragraph:1', kind: 'paragraph', text }),
  })
}

async function helloOf(url: string, token: string): Promise<Record<string, unknown>> {
  const response = await fetch(new URL('api/agent-events', url), {
    headers: { accept: 'text/event-stream', authorization: `Bearer ${token}` },
  })
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let text = ''
  while (!text.includes('\n\n')) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
  }
  await reader.cancel()
  const data = text.split('\n').find((line) => line.startsWith('data:'))
  return JSON.parse(data!.slice(5)) as Record<string, unknown>
}

function jsonLines(text: string): Array<{ event: string; data: Record<string, unknown> }> {
  return text
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as { event: string; data: Record<string, unknown> })
}

test('watch keeps running through a service restart and a new service token', { timeout: 45_000 }, async () => {
  const home = await tempHome()
  let registry = await startRegistryServer({ home, port: 0, token: 'first-service-token' })
  const port = registry.port
  let watching: Running | undefined
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, { planPath, mode: 'watch', cwd: process.cwd() })
    // No --token: the CLI uses the service token from the lock, and has to read the new one after the restart.
    watching = startCli(home, ['watch', '--url', hosted.url])
    await watching.waitFor(/Watching plan execution/)
    await waitForAgent(hosted.url)

    await registry.close()
    await delay(2_500)
    registry = await startRegistryServer({ home, port, token: 'second-service-token' })
    await watching.waitFor(/Reconnected to the plan stream/, 20_000)
    assert.match(watching.output(), /Lost the plan stream/)

    assert.equal((await postComment(hosted.url, 'Sent after the restart.')).status, 200)
    await watching.waitFor(/Sent after the restart\./)
    assert.equal(watching.child.exitCode, null)
    assert.deepEqual(pendingFromHello(await helloOf(hosted.url, hosted.token)), [])
  } finally {
    await watching?.stop()
    await registry.close().catch(() => undefined)
    await rm(home, { recursive: true, force: true })
  }
})

test('wait survives a service restart and prints the answer sent after it', { timeout: 45_000 }, async () => {
  const home = await tempHome()
  let registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  const port = registry.port
  let waiting: Running | undefined
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, { planPath, mode: 'watch', cwd: process.cwd() })
    waiting = startCli(home, ['wait', 'fail-mode', '--url', hosted.url, '--token', hosted.token, '--timeout', '40s'])
    await waitForAgent(hosted.url)

    await registry.close()
    await delay(1_500)
    assert.equal(waiting.child.exitCode, null)
    registry = await startRegistryServer({ home, port, token: 'test-token-value' })
    await waiting.waitFor(/Reconnected to the plan stream/, 20_000)

    const answered = await fetch(new URL('api/interactions/fail-mode', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'choice', id: 'fail-mode', optionId: 'open', label: 'Fail open' }),
    })
    assert.equal(answered.status, 200)
    assert.equal(await waiting.exited(), 0)
    assert.match(waiting.stdout(), /Fail open/)
  } finally {
    await waiting?.stop()
    await registry.close().catch(() => undefined)
    await rm(home, { recursive: true, force: true })
  }
})

test('events --follow stays up across watch, comment, and review, and prints each mode', { timeout: 45_000 }, async () => {
  const home = await tempHome()
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  let listening: Running | undefined
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, { planPath, mode: 'watch', cwd: process.cwd() })
    listening = startCli(home, ['events', '--follow', '--url', hosted.url, '--token', hosted.token])
    await waitForAgent(hosted.url)

    assert.equal((await runCli(home, ['mode', 'comment', '--url', hosted.url])).status, 0)
    await listening.waitFor(/"mode":"comment"/)

    const review = await runCli(home, ['mode', 'review', '--url', hosted.url, '--iteration', '2'])
    assert.equal(review.status, 0)
    assert.equal((JSON.parse(review.stdout) as { iteration: number }).iteration, 2)
    await listening.waitFor(/"mode":"review","iteration":2/)

    const verdict = await fetch(new URL('api/review', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    })
    assert.equal(verdict.status, 200)
    await listening.waitFor(/"mode":"watch","iteration":2/)

    const lines = jsonLines(listening.stdout())
    assert.deepEqual(
      lines.map((line) => (line.event === 'mode' ? `mode:${line.data.mode}` : line.event)),
      ['mode:comment', 'mode:review', 'review', 'mode:watch'],
    )
    assert.equal(lines[2]?.data.decision, 'approve')
    assert.equal(lines[2]?.data.iteration, 2)
    assert.equal(listening.child.exitCode, null)
    // The verdict was acked by the listener, so a new round may start.
    assert.equal((await runCli(home, ['mode', 'review', '--url', hosted.url, '--iteration', '3'])).status, 0)
  } finally {
    await listening?.stop()
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('a verdict sent while no agent listened is kept for the next review and refuses mode review', { timeout: 30_000 }, async () => {
  const home = await tempHome()
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, { planPath, mode: 'review', cwd: process.cwd() })
    const verdict = await fetch(new URL('api/review', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    })
    assert.equal(verdict.status, 200)

    // What `review` does on the service: register in review again, then read the hello.
    const again = await registerHostedPlan(registry.url, registry.token, { planPath, mode: 'review', iteration: 2, cwd: process.cwd() })
    assert.equal(again.mode, 'watch')
    const kept = (await helloOf(hosted.url, hosted.token)).review as { decision?: string } | null
    assert.equal(kept?.decision, 'approve')

    const refused = await runCli(home, ['mode', 'review', '--url', hosted.url])
    assert.equal(refused.status, 1)
    assert.match(refused.stderr, /live-plan events/)

    const events = await runCli(home, ['events', '--url', hosted.url, '--token', hosted.token])
    assert.equal(events.status, 0)
    assert.equal(jsonLines(events.stdout)[0]?.data.decision, 'approve')

    const allowed = await runCli(home, ['mode', 'review', '--url', hosted.url, '--iteration', '2'])
    assert.equal(allowed.status, 0)
    assert.equal((await helloOf(hosted.url, hosted.token)).review, null)
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('a wrong token fails at once instead of retrying', { timeout: 30_000 }, async () => {
  const home = await tempHome()
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, { planPath, mode: 'watch', cwd: process.cwd() })
    const started = Date.now()
    const events = await runCli(home, ['events', '--url', hosted.url, '--token', 'not-the-token'])
    assert.equal(events.status, 1)
    assert.ok(Date.now() - started < 5_000)
    assert.doesNotMatch(events.stderr, /Trying again/)
    const waited = await runCli(home, ['wait', 'fail-mode', '--url', hosted.url, '--token', 'not-the-token', '--timeout', '30s'])
    assert.equal(waited.status, 4)
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('a listener starts the service again after it crashed, and keeps printing', { timeout: 60_000 }, async () => {
  const home = await tempHome()
  const port = 20_000 + Math.floor(Math.random() * 20_000)
  let listening: Running | undefined
  try {
    const lock = await ensureRegistry({ entryFile: entry, home, port })
    const hosted = await registerHostedPlan(registryBindUrl(lock), lock.token, { planPath, mode: 'watch', cwd: process.cwd() })
    listening = startCli(home, ['events', '--follow', '--url', hosted.url, '--token', hosted.token])
    await waitForAgent(hosted.url)

    // A crash leaves the lock behind with a dead process. That is the only case a client restarts it.
    process.kill(lock.pid, 'SIGKILL')
    await listening.waitFor(/Started it again/, 30_000)
    await listening.waitFor(/Reconnected to the plan stream/, 20_000)
    const revived = await readRegistryLock(home)
    assert.ok(revived && revived.pid !== lock.pid)
    assert.equal(revived?.port, port)

    assert.equal((await postComment(hosted.url, 'Sent after the crash.')).status, 200)
    await listening.waitFor(/Sent after the crash\./)
    assert.equal(listening.child.exitCode, null)
  } finally {
    await listening?.stop()
    await stopRegistry(home)
    await rm(home, { recursive: true, force: true })
  }
})

test('revive leaves a service alone that stopped on purpose or is still running', async () => {
  const home = await tempHome()
  try {
    // No lock: nothing to revive.
    assert.equal(await reviveRegistry({ entryFile: entry, home }), false)
    const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
    // A running service, whatever its version, is never touched.
    assert.equal(await reviveRegistry({ entryFile: entry, home }), false)
    await registry.close()
    // A clean stop removes the lock, so it stays stopped.
    assert.equal(await readRegistryLock(home), null)
    assert.equal(await reviveRegistry({ entryFile: entry, home }), false)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
