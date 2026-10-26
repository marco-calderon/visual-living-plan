import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readGitSnapshot } from '../src/gitStatus.ts'
import { isPidAlive } from '../src/pid.ts'
import { parsePlan } from '../src/parse.ts'
import type { ProcessRecord } from '../src/processRecord.ts'
import { emptyGitSnapshot, finishedPlan } from '../src/processRecord.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'
import {
  ensureRegistry,
  listProcesses,
  preferLoopbackUrl,
  readPackageVersion,
  readRegistryLock,
  registerProcess,
  registryBindUrl,
  registryHealthy,
  rewriteToBindUrl,
  unregisterProcess,
  watchRegisteredPlan,
} from '../src/registryClient.ts'
import { writeRegistryLock } from '../src/registryLock.ts'
import { startRegistryServer } from '../src/registryService.ts'
import { openRegistryStore, type StoredPlanSession } from '../src/registryStore.ts'
import { createIdleExecutionState } from '../src/execution.ts'
import { startLivingPlanServer } from '../src/server.ts'

const entryFile = fileURLToPath(new URL('../src/cli.ts', import.meta.url))

function sample(overrides: Partial<ProcessRecord> = {}): ProcessRecord {
  const now = Date.now()
  return {
    id: '11111111-1111-4111-8111-111111111111',
    pid: process.pid,
    title: 'Rate limiting rollout',
    summary: 'Add a limiter',
    agent: 'local-cursor',
    mode: 'watch',
    planPath: '/workspace/examples/rate-limit.plan.md',
    directory: '/workspace/examples',
    cwd: '/workspace',
    url: 'http://127.0.0.1:9410',
    host: '127.0.0.1',
    port: 9410,
    startedAt: now - 5_000,
    heartbeatAt: now,
    pendingCount: 2,
    executionActive: false,
    executionStep: null,
    git: {
      isRepo: true,
      root: '/workspace',
      branch: 'main',
      commit: 'abc1234',
      dirty: true,
      ahead: 1,
      behind: 0,
      changedFiles: 1,
      changedPaths: ['src/cli.ts'],
      summary: 'main @ abc1234 · dirty · 1 file · ahead 1',
    },
    ...overrides,
  }
}

async function tempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'live-plan-registry-'))
}

test('registry store keeps plans and prunes stale or dead pids', async () => {
  const store = await openRegistryStore(':memory:')
  try {
    const first = sample()
    store.upsert(first)
    store.upsert({ ...first, title: 'Renamed', startedAt: first.startedAt + 50_000 })
    const stored = store.get(first.id)
    assert.equal(stored?.title, 'Renamed')
    assert.equal(stored?.startedAt, first.startedAt)
    assert.equal(stored?.git.summary, first.git.summary)
    assert.equal(stored?.directory, '/workspace/examples')

    const pulsed = store.heartbeat(first.id, {
      at: Date.now(),
      pendingCount: 0,
      executionActive: true,
      executionStep: 'Implement middleware',
      git: { ...first.git, dirty: false, changedFiles: 0, changedPaths: [], summary: 'main @ abc1234 · clean' },
    })
    assert.equal(pulsed?.executionStep, 'Implement middleware')
    assert.equal(pulsed?.git.dirty, false)
    assert.equal(pulsed?.startedAt, first.startedAt)

    const stale = sample({
      id: '22222222-2222-4222-8222-222222222222',
      heartbeatAt: Date.now() - 60_000,
    })
    const dead = sample({
      id: '33333333-3333-4333-8333-333333333333',
      pid: 2_147_483_646,
      heartbeatAt: Date.now(),
    })
    store.upsert(stale)
    store.upsert(dead)
    const removed = store.prune({
      now: Date.now(),
      staleMs: 20_000,
      isAlive: (pid) => pid === process.pid,
    })
    assert.deepEqual(removed.sort(), [dead.id, stale.id].sort())
    assert.equal(store.list().length, 1)
    assert.equal(store.list()[0]?.id, first.id)
    const runs = store.listRuns()
    assert.equal(runs.find((entry) => entry.id === stale.id)?.status, 'interrupted')
    assert.equal(runs.find((entry) => entry.id === dead.id)?.status, 'interrupted')
  } finally {
    store.close()
  }
})

test('registry store round-trips sessions and finished runs', async () => {
  const store = await openRegistryStore(':memory:')
  try {
    const session: StoredPlanSession = {
      id: '66666666-6666-4666-8666-666666666666',
      token: 'session-token',
      planPath: '/workspace/examples/rate-limit.plan.md',
      mode: 'review',
      iteration: 1,
      cwd: '/workspace',
      configPath: null,
      responsesJson: '{"ask":{"value":"yes"}}',
      executionJson: '{}',
      reviewJson: null,
      commentsJson: '[]',
      startedAt: 1_700_000_000_000,
      lastSeenAt: 1_700_000_000_500,
    }
    store.saveSession(session)
    assert.deepEqual(store.getSession(session.id), session)
    assert.deepEqual(store.getSessionByPath(session.planPath), session)
    assert.equal(store.listSessions().length, 1)

    store.saveSession({ ...session, iteration: 2, lastSeenAt: session.lastSeenAt + 10, reviewJson: '{"decision":"approve"}' })
    const updated = store.getSession(session.id)
    assert.equal(updated?.iteration, 2)
    assert.equal(updated?.startedAt, session.startedAt)
    assert.equal(updated?.reviewJson, '{"decision":"approve"}')
    assert.equal(store.deleteSession(session.id), true)
    assert.equal(store.getSession(session.id), undefined)
    assert.equal(store.deleteSession(session.id), false)

    const run = finishedPlan(sample(), 'executed', 'approve', sample().heartbeatAt)
    store.saveRun(run)
    store.saveRun({ ...run, title: 'Updated run' })
    const listed = store.listRuns()
    assert.equal(listed.length, 1)
    assert.equal(listed[0]?.title, 'Updated run')
    assert.equal(listed[0]?.outcome, 'approve')
    assert.equal(listed[0]?.status, 'executed')
    assert.equal(listed[0]?.git.summary, run.git.summary)
    assert.deepEqual(listed[0]?.git.changedPaths, run.git.changedPaths)
  } finally {
    store.close()
  }
})

test('registry http api registers, lists, and requires a token to mutate', async () => {
  const home = await tempHome()
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  try {
    const health = await fetch(new URL('/api/health', registry.url))
    assert.equal((await health.json()).ok, true)

    const page = await fetch(registry.url)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /Running plans/)

    const dashboardPage = await fetch(new URL('/dashboard', registry.url))
    assert.equal(dashboardPage.status, 200)
    const dashboardHtml = await dashboardPage.text()
    assert.match(dashboardHtml, /Control dashboard/)
    assert.match(dashboardHtml, /<table>/)

    const denied = await fetch(new URL('/api/processes', registry.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sample()),
    })
    assert.equal(denied.status, 401)

    const created = await registerProcess(registry.url, registry.token, sample())
    assert.equal(created.title, 'Rate limiting rollout')
    assert.equal(created.url, 'http://127.0.0.1:9410')
    const archived = await readFile(join(home, 'plans', `${sample().id}.plan.md`), 'utf8')
    assert.match(archived, /Rate limiting rollout/)

    const listed = await fetch(new URL('/api/processes', registry.url))
    const body = (await listed.json()) as { processes: ProcessRecord[] }
    assert.equal(body.processes.length, 1)
    assert.equal(body.processes[0]?.directory, '/workspace/examples')
    assert.equal(body.processes[0]?.git.branch, 'main')

    const gone = sample({ id: '44444444-4444-4444-8444-444444444444', pid: 2_147_483_646 })
    await registerProcess(registry.url, registry.token, gone)
    const afterPrune = (await (await fetch(new URL('/api/processes', registry.url))).json()) as {
      processes: ProcessRecord[]
    }
    assert.equal(afterPrune.processes.length, 1)
    assert.equal(afterPrune.processes[0]?.id, sample().id)

    await unregisterProcess(registry.url, registry.token, sample().id, 'approve')
    const empty = (await (await fetch(new URL('/api/processes', registry.url))).json()) as {
      processes: ProcessRecord[]
    }
    assert.equal(empty.processes.length, 0)

    const dash = (await (await fetch(new URL('/api/dashboard?period=day', registry.url))).json()) as {
      summary: { running: number; executed: number; interrupted: number; filesModified: number }
      plans: Array<{ id: string; status: string; outcome: string | null; directory: string }>
    }
    assert.equal(dash.summary.running, 0)
    assert.equal(dash.summary.executed, 1)
    assert.equal(dash.summary.interrupted, 1)
    const finished = dash.plans.find((plan) => plan.id === sample().id)
    assert.equal(finished?.status, 'executed')
    assert.equal(finished?.outcome, 'approve')
    assert.equal(finished?.directory, '/workspace/examples')

    const badPeriod = await fetch(new URL('/api/dashboard?period=year', registry.url))
    assert.equal(badPeriod.status, 400)

    const archivedPage = await fetch(new URL(`/archive/${sample().id}`, registry.url))
    assert.equal(archivedPage.status, 200)
    assert.match(await archivedPage.text(), /Rate limiting rollout/)
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('planner page lists registered plans and links their directories', async () => {
  const home = await tempHome()
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  const planPath = resolve('examples/rate-limit.plan.md')
  const selfId = '55555555-5555-4555-8555-555555555555'
  const planServer = await startLivingPlanServer({
    planPath,
    mode: 'watch',
    port: 0,
    registry: { url: registry.url, selfId },
  })
  try {
    const state = planServer.getState()
    const directory = resolve('examples')
    await registerProcess(registry.url, registry.token, {
      id: selfId,
      pid: process.pid,
      title: state.plan.title,
      summary: state.plan.summary,
      agent: state.plan.agent,
      mode: 'watch',
      planPath,
      directory,
      cwd: process.cwd(),
      url: planServer.url,
      host: '127.0.0.1',
      port: planServer.port,
      pendingCount: state.pendingInteractionIds.length,
      executionActive: false,
      git: readGitSnapshot(directory),
    })

    const listed = (await (await fetch(new URL('/api/processes', planServer.url))).json()) as {
      status: string
      selfId: string
      processes: ProcessRecord[]
    }
    assert.equal(listed.status, 'ok')
    assert.equal(listed.selfId, selfId)
    assert.equal(listed.processes[0]?.title, 'Rate limiting rollout')
    assert.equal(listed.processes[0]?.directory, directory)
    assert.equal(listed.processes[0]?.git.isRepo, true)
    assert.equal(listed.processes[0]?.url, planServer.url)

    const html = await (await fetch(planServer.url)).text()
    assert.match(html, /data-processes-root/)
    assert.match(html, /\/api\/processes/)
    assert.match(html, /data-processes-dashboard/)

    const missingAsset = await fetch(new URL('/client/assets/missing.js', planServer.url))
    assert.equal(missingAsset.status, 404)
    assert.equal(((await missingAsset.json()) as { error: string }).error, 'Asset not found')

    const events = await fetch(new URL('/api/events', planServer.url))
    assert.equal(events.headers.get('content-type'), 'text/event-stream')
    const reader = events.body?.getReader()
    assert.ok(reader)
    const first = await reader.read()
    assert.match(new TextDecoder().decode(first.value), /event: hello/)
    await reader.cancel()

    const probeDir = resolve('dist/client/assets')
    await mkdir(probeDir, { recursive: true })
    await writeFile(join(probeDir, 'probe.txt'), 'probe-ok')
    try {
      const asset = await fetch(new URL('/client/assets/probe.txt', planServer.url))
      assert.equal(asset.status, 200)
      assert.equal(await asset.text(), 'probe-ok')
      // Vite modulepreload historically requested /assets/* (base "/"); keep that alias.
      const legacyAsset = await fetch(new URL('/assets/probe.txt', planServer.url))
      assert.equal(legacyAsset.status, 200)
      assert.equal(await legacyAsset.text(), 'probe-ok')
    } finally {
      await rm(join(probeDir, 'probe.txt'), { force: true })
    }
  } finally {
    await planServer.close()
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('planner page reports when the registry was not configured', async () => {
  const plan = parsePlan('---\ntitle: Test plan\n---\n\n# Test plan\n', 'test.plan.md')
  const html = renderPlanPage({
    plan,
    mode: 'watch',
    responses: {},
    diffs: [],
    iteration: 1,
    pendingInteractionIds: [],
    execution: createIdleExecutionState(),
    clientAssets: null,
    theme: themePayload(defaultThemeConfig(), 'live-plan.config.json'),
  })
  assert.match(html, /data-processes-root/)
  assert.match(html, /Running plans/)

  const planServer = await startLivingPlanServer({
    planPath: resolve('examples/rate-limit.plan.md'),
    mode: 'watch',
    port: 0,
  })
  try {
    const body = (await (await fetch(new URL('/api/processes', planServer.url))).json()) as {
      status: string
      processes: unknown[]
    }
    assert.equal(body.status, 'disabled')
    assert.deepEqual(body.processes, [])
  } finally {
    await planServer.close()
  }
})

test('watchRegisteredPlan keeps an executed plan when the process stops', async () => {
  const home = await tempHome()
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  try {
    const session = await watchRegisteredPlan({
      registryUrl: registry.url,
      token: registry.token,
      record: sample(),
    })
    assert.equal((await listProcesses(registry.url)).length, 1)
    await session.stop()
    assert.equal((await listProcesses(registry.url)).length, 0)
    const archived = await readFile(join(home, 'plans', `${sample().id}.plan.md`), 'utf8')
    assert.match(archived, /Rate limiting rollout/)
    const history = (await (await fetch(new URL('/api/plans', registry.url))).json()) as {
      plans: Array<{ status: string }>
    }
    assert.equal(history.plans.length, 1)
    assert.equal(history.plans[0]?.status, 'executed')
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('rewriteToBindUrl keeps the plan path on the bind address', () => {
  const lock = {
    pid: 1,
    port: 9477,
    host: '127.0.0.1',
    url: 'http://living-plan.local:9477',
    token: 't',
    startedAt: 0,
  }
  assert.equal(registryBindUrl(lock), 'http://127.0.0.1:9477')
  assert.equal(
    rewriteToBindUrl(lock, 'http://living-plan.local:9477/plans/abcdefghi/'),
    'http://127.0.0.1:9477/plans/abcdefghi/',
  )
  assert.equal(
    rewriteToBindUrl({ ...lock, url: 'http://127.0.0.1:9477' }, 'http://visual-living-plan.local/plans/abcdefghi/'),
    'http://127.0.0.1:9477/plans/abcdefghi/',
  )
  assert.equal(
    rewriteToBindUrl({ ...lock, url: 'http://living-plan.local' }, 'http://living-plan.local/plans/abcdefghi/'),
    'http://127.0.0.1:9477/plans/abcdefghi/',
  )
  assert.equal(
    rewriteToBindUrl(lock, 'http://10.0.0.8:9477/plans/abcdefghi/'),
    'http://10.0.0.8:9477/plans/abcdefghi/',
  )
  assert.equal(preferLoopbackUrl('http://visual-living-plan.local/plans/abcdefghi/'), 'http://127.0.0.1:9477/plans/abcdefghi/')
  assert.equal(preferLoopbackUrl('http://127.0.0.1:9400/plans/abcdefghi/'), 'http://127.0.0.1:9400/plans/abcdefghi/')
})

test('ensureRegistry reuses a service advertised on a slow public name', async () => {
  const home = await tempHome()
  const version = await readPackageVersion(entryFile)
  const registry = await startRegistryServer({ home, port: 0, version, token: 'bind-health-token' })
  try {
    const lock = await readRegistryLock(home)
    assert.ok(lock)
    assert.equal(lock.pid, process.pid)
    await writeRegistryLock(home, { ...lock, url: `http://living-plan.local:${lock.port}` })
    const started = Date.now()
    const again = await ensureRegistry({ entryFile, home })
    assert.ok(Date.now() - started < 2_000)
    assert.equal(again.pid, lock.pid)
    assert.equal(again.token, lock.token)
    assert.equal(await registryHealthy(registryBindUrl(again)), true)
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('ensureRegistry starts one shared server and reuses it', async () => {
  const home = await tempHome()
  let pid = 0
  try {
    const first = await ensureRegistry({ entryFile, home, port: 0 })
    pid = first.pid
    assert.equal(isPidAlive(first.pid), true)
    assert.equal(first.url.startsWith('http://127.0.0.1:'), true)
    const second = await ensureRegistry({ entryFile, home, port: 0 })
    assert.equal(second.pid, first.pid)
    assert.equal(second.url, first.url)

    const registered = await registerProcess(first.url, first.token, {
      ...sample(),
      git: emptyGitSnapshot(),
    })
    assert.equal(registered.directory, '/workspace/examples')
  } finally {
    if (pid && isPidAlive(pid)) {
      process.kill(pid, 'SIGTERM')
      const started = Date.now()
      while (isPidAlive(pid) && Date.now() - started < 5_000) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
      }
    }
    await rm(home, { recursive: true, force: true })
  }
})

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolvePort(port))
    })
  })
}

function collectOutput(child: ChildProcess): () => string {
  let output = ''
  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    output += chunk
  })
  child.stderr?.on('data', (chunk: string) => {
    output += chunk
  })
  return () => output
}

function waitForExit(child: ChildProcess, timeoutMs: number, output: () => string): Promise<number | null> {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode)
  return new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for exit\n${output()}`)), timeoutMs)
    child.once('exit', (code) => {
      clearTimeout(timer)
      resolveExit(code)
    })
  })
}

async function waitForOutput(output: () => string, pattern: RegExp, timeoutMs: number): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (pattern.test(output())) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
  }
  throw new Error(`timed out waiting for ${pattern}\n${output()}`)
}

async function stopProcess(pid: number): Promise<void> {
  if (!pid || !isPidAlive(pid)) return
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    return
  }
  const started = Date.now()
  while (isPidAlive(pid) && Date.now() - started < 5_000) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
  }
  if (isPidAlive(pid)) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }
}

/** Session id from `/proc`. A detached service is the leader of its own session. */
function sessionId(pid: number): number | null {
  if (process.platform !== 'linux') return null
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)
    const sid = Number(fields[3])
    return Number.isInteger(sid) ? sid : null
  } catch {
    return null
  }
}

test('spawned registry keeps running after CLI clients disconnect', { timeout: 30_000 }, async () => {
  const home = await tempHome()
  const port = await freePort()
  const plan = resolve('examples/rate-limit.plan.md')
  const env = { ...process.env, LIVE_PLAN_HOME: home }
  let servicePid = 0

  const spawnCli = (args: string[], detached = false): ChildProcess =>
    spawn(process.execPath, [entryFile, ...args], {
      cwd: resolve('.'),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached,
    })

  try {
    const detached = spawnCli(['serve', plan, '--detach', '--no-open', '--registry-port', String(port)])
    const detachedOutput = collectOutput(detached)
    const detachedCode = await waitForExit(detached, 20_000, detachedOutput)
    assert.equal(detachedCode, 0, detachedOutput())

    const lock = await readRegistryLock(home)
    assert.ok(lock)
    servicePid = lock.pid
    assert.equal(isPidAlive(servicePid), true)
    assert.equal(await registryHealthy(registryBindUrl(lock)), true)
    if (process.platform === 'linux') assert.equal(sessionId(servicePid), servicePid)
    const planUrl = detachedOutput().match(/Living Plan \(watch\): (http:\/\/\S+)/)?.[1]
    assert.ok(planUrl)
    const apiPlanUrl = rewriteToBindUrl(lock, planUrl)

    const queuedChoice = await fetch(new URL('api/interactions/fail-mode', apiPlanUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'choice', id: 'fail-mode', optionId: 'open', label: 'Fail open' }),
    })
    assert.equal(queuedChoice.status, 200)
    const queuedComment = await fetch(new URL('api/comments', apiPlanUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ partId: 'phase:design/paragraph:1', kind: 'paragraph', text: 'Check the limit.' }),
    })
    assert.equal(queuedComment.status, 200)

    const events = spawnCli(['events', '--url', planUrl])
    const eventsOutput = collectOutput(events)
    const eventsCode = await waitForExit(events, 8_000, eventsOutput)
    assert.equal(eventsCode, 0, eventsOutput())
    assert.match(eventsOutput(), /"event":"interaction"/)
    assert.match(eventsOutput(), /"event":"comment"/)
    assert.match(eventsOutput(), /Fail open/)
    assert.match(eventsOutput(), /Check the limit/)
    assert.equal(isPidAlive(servicePid), true)

    const waiting = spawnCli(['events', '--url', planUrl])
    const waitingOutput = collectOutput(waiting)
    await waitForOutput(waitingOutput, /Listening for the next submission/, 8_000)
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 300))
    assert.equal(waiting.exitCode, null)
    waiting.kill('SIGINT')
    await waitForExit(waiting, 5_000, waitingOutput)
    assert.equal(isPidAlive(servicePid), true)
    assert.equal(await registryHealthy(registryBindUrl(lock)), true)
    const listed = (await (await fetch(new URL('/api/processes', registryBindUrl(lock)))).json()) as {
      processes: unknown[]
    }
    assert.equal(listed.processes.length > 0, true)

    const attached = spawnCli(['serve', plan, '--no-open', '--registry-port', String(port)], true)
    const attachedOutput = collectOutput(attached)
    await waitForOutput(attachedOutput, /Listening for submissions/, 8_000)
    assert.ok(attached.pid)
    process.kill(-attached.pid, 'SIGINT')
    await waitForExit(attached, 8_000, attachedOutput)
    assert.equal(isPidAlive(servicePid), true)
    assert.equal((await readRegistryLock(home))?.pid, servicePid)
    assert.equal(await registryHealthy(registryBindUrl(lock)), true)

    const close = spawnCli(['close', '--url', planUrl])
    const closeOutput = collectOutput(close)
    const closeCode = await waitForExit(close, 8_000, closeOutput)
    assert.equal(closeCode, 0, closeOutput())
    assert.match(closeOutput(), /Closed /)
    assert.equal(isPidAlive(servicePid), true)
    assert.equal((await readRegistryLock(home))?.pid, servicePid)
    assert.equal(await registryHealthy(registryBindUrl(lock)), true)

    process.kill(servicePid, 'SIGHUP')
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 300))
    assert.equal(isPidAlive(servicePid), true)
    assert.equal(await registryHealthy(registryBindUrl(lock)), true)
  } finally {
    await stopProcess(servicePid)
    await rm(home, { recursive: true, force: true })
  }
})
