import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readGitSnapshot } from '../src/gitStatus.ts'
import { isPidAlive } from '../src/pid.ts'
import { parsePlan } from '../src/parse.ts'
import type { ProcessRecord } from '../src/processRecord.ts'
import { emptyGitSnapshot } from '../src/processRecord.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'
import {
  ensureRegistry,
  listProcesses,
  registerProcess,
  unregisterProcess,
  watchRegisteredPlan,
} from '../src/registryClient.ts'
import { startRegistryServer } from '../src/registryService.ts'
import { openRegistryStore } from '../src/registryStore.ts'
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
    assert.equal(store.get(stale.id)?.status, 'interrupted')
    assert.equal(store.get(dead.id)?.status, 'interrupted')
    assert.equal(store.listPlans().length, 3)
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

    const archivedPage = await fetch(new URL(`/plans/${sample().id}`, registry.url))
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
