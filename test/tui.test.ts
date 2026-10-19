import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { isPidAlive } from '../src/pid.ts'
import {
  closeHostedPlan,
  readRegistryLock,
  registerHostedPlan,
  registryBindUrl,
  registryHealthy,
} from '../src/registryClient.ts'
import { startRegistryServer } from '../src/registryService.ts'
import { emptyGitSnapshot, type PlanRecord, type ProcessRecord } from '../src/processRecord.ts'
import {
  archiveUrl,
  completionDetail,
  dashboardStatusLine,
  formatDuration,
  gitLine,
  livePlanUrl,
  orderPlans,
  planSubtitle,
  presentPlans,
  shiftFilter,
  shiftPeriod,
} from '../src/tui/dashboardView.ts'
import { readDashboard } from '../src/tui/readDashboard.ts'
import { readProcesses } from '../src/tui/readProcesses.ts'
import { processLines, processOpenUrl, processUptime, registryStatusLine } from '../src/tui/registryView.ts'
import { parseTuiArgs, runTui } from '../src/tui/runTui.ts'

const entryFile = fileURLToPath(new URL('../src/cli.ts', import.meta.url))

const planPath = resolve('examples/rate-limit.plan.md')

function plan(overrides: Partial<PlanRecord> = {}): PlanRecord {
  const now = Date.now()
  return {
    id: '11111111-1111-4111-8111-111111111111',
    pid: 1,
    title: 'Rate limiting rollout',
    summary: null,
    agent: null,
    mode: 'watch',
    status: 'executed',
    planPath: '/tmp/work.plan.md',
    storedPath: null,
    directory: '/tmp/work',
    cwd: '/tmp',
    url: 'http://127.0.0.1:9410',
    host: '127.0.0.1',
    port: 9410,
    startedAt: now,
    endedAt: now,
    heartbeatAt: now,
    durationMs: 5_000,
    pendingCount: 0,
    phaseTotal: 2,
    phaseDone: 2,
    interactionTotal: 1,
    interactionDone: 1,
    completionRatio: 100,
    completionState: 'complete',
    executionActive: false,
    executionStep: null,
    filesModified: 1,
    outcome: null,
    git: emptyGitSnapshot(),
    ...overrides,
  }
}

test('duration labels match the dashboard page', () => {
  assert.equal(formatDuration(0), '0s')
  assert.equal(formatDuration(59_000), '59s')
  assert.equal(formatDuration(60_000), '1m')
  assert.equal(formatDuration(3_600_000), '1h 0m')
  assert.equal(formatDuration(47 * 3_600_000), '47h 0m')
  assert.equal(formatDuration(48 * 3_600_000), '2d 0h')
})

test('active plans are listed before finished plans', () => {
  const newerExecuted = plan({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'executed',
    startedAt: 300,
    executionActive: false,
  })
  const olderRunning = plan({
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    status: 'running',
    startedAt: 100,
    executionActive: false,
    endedAt: null,
  })
  const executing = plan({
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    status: 'running',
    startedAt: 50,
    executionActive: true,
    executionStep: 'Implement middleware',
    endedAt: null,
  })
  const interrupted = plan({
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    status: 'interrupted',
    startedAt: 400,
  })

  const ordered = orderPlans([newerExecuted, interrupted, olderRunning, executing])
  assert.deepEqual(
    ordered.map((entry) => entry.id),
    [executing.id, olderRunning.id, interrupted.id, newerExecuted.id],
  )

  const runningOnly = presentPlans([newerExecuted, olderRunning, executing], 'running')
  assert.deepEqual(
    runningOnly.map((entry) => entry.id),
    [executing.id, olderRunning.id],
  )
})

test('status line counts the period and the client-side filter', () => {
  const line = dashboardStatusLine(
    {
      period: 'day',
      label: 'Today',
      from: 0,
      to: 0,
      plans: 2,
      started: 1,
      running: 1,
      executed: 1,
      interrupted: 0,
      filesModified: 4,
      durationMs: 1_000,
      folders: 2,
    },
    'running',
    1,
  )
  assert.match(line, /^Today · 2 plans active · 1 started in this period · showing 1$/)
})

test('tui period defaults to day and rejects an unknown period', () => {
  const day = parseTuiArgs([])
  assert.equal('error' in day, false)
  if (!('error' in day)) assert.equal(day.period, 'day')

  const week = parseTuiArgs(['--period', 'week', '--port', '9488'])
  assert.equal('error' in week, false)
  if (!('error' in week)) {
    assert.equal(week.period, 'week')
    assert.equal(week.port, 9488)
  }

  const rejected = parseTuiArgs(['--period', 'year'])
  assert.deepEqual(rejected, { error: 'period must be day, week, or month' })
})

test('terminal dashboard reads GET /api/dashboard', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-tui-'))
  const registry = await startRegistryServer({ home, port: 0, token: 'tui-token' })
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, {
      planPath,
      mode: 'watch',
      cwd: process.cwd(),
    })
    const day = await readDashboard(registry.url, 'day')
    assert.equal(day.summary.period, 'day')
    assert.equal(day.summary.label, 'Today')
    assert.equal(day.summary.running, 1)
    assert.equal(day.plans.some((entry) => entry.id === hosted.id && entry.status === 'running'), true)

    const week = await readDashboard(registry.url, 'week')
    assert.equal(week.summary.period, 'week')
    assert.equal(week.plans.some((entry) => entry.id === hosted.id), true)

    await closeHostedPlan(registry.url, registry.token, hosted.id)
    const after = await readDashboard(registry.url, 'day')
    const closed = after.plans.find((entry) => entry.id === hosted.id)
    assert.equal(closed?.status, 'executed')
    const visible = presentPlans(after.plans, 'executed')
    assert.equal(visible.some((entry) => entry.id === hosted.id), true)

    const comment = await registerHostedPlan(registry.url, registry.token, {
      planPath,
      mode: 'comment',
      cwd: process.cwd(),
    })
    const commented = await readDashboard(registry.url, 'day')
    const commentRow = commented.plans.find((entry) => entry.id === comment.id)
    assert.equal(commentRow?.mode, 'comment')
    assert.equal(commentRow?.status, 'running')
    if (commentRow) assert.match(planSubtitle(commentRow), /^comment/)

    const live = await readProcesses(registry.url)
    assert.equal(live.some((entry) => entry.id === comment.id && entry.mode === 'comment'), true)
    assert.equal(comment.id, hosted.id)

    await closeHostedPlan(registry.url, registry.token, comment.id)
    const afterClose = await readProcesses(registry.url)
    assert.equal(afterClose.some((entry) => entry.id === comment.id), false)

    const bad = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch(request) {
        const path = new URL(request.url).pathname
        if (path === '/api/processes') return Response.json({ processes: { nope: true } })
        if (path === '/api/dashboard') return Response.json({ summary: null, plans: 'nope' })
        return new Response('no', { status: 500 })
      },
    })
    try {
      await assert.rejects(readProcesses(bad.url), /Could not read the registry/)
      await assert.rejects(readDashboard(bad.url, 'day'), /Could not read the dashboard/)
    } finally {
      bad.stop(true)
    }
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('keyboard helpers move period and status the way the dashboard controls do', () => {
  assert.equal(shiftPeriod('day', 1), 'week')
  assert.equal(shiftPeriod('week', 1), 'month')
  assert.equal(shiftPeriod('month', 1), 'day')
  assert.equal(shiftPeriod('day', -1), 'month')
  assert.equal(shiftFilter('all'), 'running')
  assert.equal(shiftFilter('running'), 'executed')
  assert.equal(shiftFilter('executed'), 'interrupted')
  assert.equal(shiftFilter('interrupted'), 'all')
})

test('open links follow the registry rules', () => {
  const running = plan({ status: 'running', url: 'http://127.0.0.1:9477/plans/abc/' })
  assert.equal(livePlanUrl(running), 'http://127.0.0.1:9477/plans/abc/')
  assert.equal(livePlanUrl(plan({ status: 'executed', url: 'http://127.0.0.1:9477/plans/abc/' })), null)
  assert.equal(livePlanUrl(plan({ status: 'running', url: 'javascript:alert(1)' })), null)
  assert.equal(
    archiveUrl('http://127.0.0.1:9477', plan({ id: 'plan/1', storedPath: '/tmp/plans/plan.plan.md' })),
    'http://127.0.0.1:9477/archive/plan%2F1',
  )
  assert.equal(archiveUrl('http://127.0.0.1:9477', plan({ storedPath: null })), null)

  const record = plan({ url: 'http://127.0.0.1:9477/plans/abc/' })
  assert.equal(processOpenUrl(record), 'http://127.0.0.1:9477/plans/abc/')
  assert.equal(processOpenUrl(plan({ url: 'file:///tmp/plan.md' })), null)
})

test('running-plan lines match the registry home card', () => {
  assert.equal(registryStatusLine(0), 'No plans are running.')
  assert.equal(registryStatusLine(1), '1 plan linked to a directory.')
  assert.equal(registryStatusLine(3), '3 plans linked to directories.')
  assert.equal(processUptime(1_000, 1_000), '0s')
  assert.equal(processUptime(0, 59_000), '59s')
  assert.equal(processUptime(0, 60_000), '1m')
  assert.equal(processUptime(0, 125 * 60_000), '2h 5m')

  const now = 1_000_000
  const record: ProcessRecord = {
    ...plan({
      mode: 'comment',
      pid: 42,
      startedAt: now - 120_000,
      pendingCount: 2,
      executionActive: true,
      executionStep: 'Ship the limiter',
      directory: '/tmp/work',
      planPath: '/tmp/work/rate.plan.md',
      git: {
        ...emptyGitSnapshot('main · dirty'),
        isRepo: true,
        root: '/tmp',
        branch: 'main',
        dirty: true,
        summary: 'main · dirty',
        changedPaths: ['src/a.ts', 'src/b.ts'],
      },
    }),
  }
  assert.match(planSubtitle(record as PlanRecord), /comment/)
  assert.equal(gitLine(record as PlanRecord), 'main · dirty')
  assert.equal(completionDetail(record as PlanRecord).label, '100% · Complete')
  const lines = processLines(record, now)
  assert.deepEqual(lines.slice(0, 4), [
    '/tmp/work',
    '/tmp/work/rate.plan.md',
    'main · dirty',
    'Repository /tmp',
  ])
  assert.equal(lines.at(-1), 'pid 42 · up 2m · 2 pending · live · Ship the limiter')
})

test('tui arguments accept the registry flags and reject a missing value', () => {
  const named = parseTuiArgs(['--no-local-name', '--registry-host', '127.0.0.1', '--registry-port', '9501'])
  assert.equal('error' in named, false)
  if (!('error' in named)) {
    assert.equal(named.localName, false)
    assert.equal(named.host, '127.0.0.1')
    assert.equal(named.port, 9501)
    assert.equal(named.period, 'day')
  }
  assert.deepEqual(parseTuiArgs(['--period']), { error: 'period must be day, week, or month' })
  assert.deepEqual(parseTuiArgs(['--port']), { error: 'port must be a positive number' })
  assert.deepEqual(parseTuiArgs(['--host']), { error: 'host must be an address' })
})

test('tui does not start the registry for bad arguments or a non-interactive terminal', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-tui-skip-'))
  try {
    assert.equal(await runTui(['--period', 'year'], entryFile, { home }), 1)
    assert.equal(await readRegistryLock(home), null)
    assert.equal(await runTui([], entryFile, { home, interactive: false }), 1)
    assert.equal(await readRegistryLock(home), null)
  } finally {
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

async function waitForText(read: () => string, pattern: RegExp, timeoutMs: number): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (pattern.test(read())) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
  }
  throw new Error(`timed out waiting for ${pattern}\n${read().slice(-1500)}`)
}

function spawnTui(home: string, port: number) {
  let output = ''
  const terminal = new Bun.Terminal({
    cols: 140,
    rows: 42,
    data(_term, data) {
      output += new TextDecoder().decode(data)
    },
  })
  const proc = Bun.spawn(
    [process.execPath, entryFile, 'tui', '--registry-port', String(port), '--no-local-name', '--period', 'day'],
    {
      cwd: resolve('.'),
      env: { ...process.env, LIVE_PLAN_HOME: home, LIVE_PLAN_LOCAL_NAME: '0' },
      terminal,
    },
  )
  return {
    proc,
    terminal,
    output: () => output,
  }
}

test('tui starts the persistent registry and quitting leaves it running', { timeout: 45_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-tui-live-'))
  const port = await freePort()
  let servicePid = 0
  let terminal: Bun.Terminal | undefined
  try {
    const first = spawnTui(home, port)
    terminal = first.terminal
    await waitForText(first.output, /Control dashboard/, 20_000)

    const lock = await readRegistryLock(home)
    assert.ok(lock)
    servicePid = lock.pid
    assert.notEqual(servicePid, first.proc.pid)
    assert.equal(isPidAlive(servicePid), true)
    assert.equal(await registryHealthy(registryBindUrl(lock)), true)
    if (process.platform === 'linux') assert.equal(sessionId(servicePid), servicePid)

    const hosted = await registerHostedPlan(registryBindUrl(lock), lock.token, {
      planPath,
      mode: 'watch',
      cwd: process.cwd(),
    })
    assert.match(hosted.url, /\/plans\//)
    await waitForText(first.output, /Rate limiting rollout/, 10_000)

    const beforeWeek = first.output().length
    first.terminal.write('2')
    await waitForText(() => first.output().slice(beforeWeek), /week ·/, 8_000)

    const beforeFilter = first.output().length
    first.terminal.write('f')
    await waitForText(() => first.output().slice(beforeFilter), /showing 1/, 8_000)

    const beforeRunning = first.output().length
    first.terminal.write('p')
    await waitForText(() => first.output().slice(beforeRunning), /1 plan linked to a directory/, 8_000)
    assert.match(first.output().slice(beforeRunning), /Rate limiting rollout/)

    first.terminal.write('q')
    const code = await Promise.race([
      first.proc.exited,
      new Promise<number>((_resolve, reject) => setTimeout(() => reject(new Error('tui did not exit')), 8_000)),
    ])
    assert.equal(code, 0)
    assert.equal(isPidAlive(servicePid), true)
    assert.equal((await readRegistryLock(home))?.pid, servicePid)
    assert.equal(await registryHealthy(registryBindUrl(lock)), true)
    first.terminal.close()
    terminal = undefined

    const second = spawnTui(home, port)
    terminal = second.terminal
    await waitForText(second.output, /Running plans|Control dashboard/, 15_000)
    assert.equal((await readRegistryLock(home))?.pid, servicePid)
    assert.ok(second.proc.pid)
    process.kill(second.proc.pid, 'SIGINT')
    await Promise.race([
      second.proc.exited,
      new Promise<void>((_resolve, reject) => setTimeout(() => reject(new Error('tui ignored SIGINT')), 8_000)),
    ])
    assert.equal(isPidAlive(servicePid), true)
    assert.equal(await registryHealthy(registryBindUrl(lock)), true)

    const third = spawnTui(home, port)
    second.terminal.close()
    terminal = third.terminal
    await waitForText(third.output, /LIVING PLAN/, 15_000)
    assert.ok(third.proc.pid)
    process.kill(third.proc.pid, 'SIGHUP')
    await Promise.race([
      third.proc.exited,
      new Promise<void>((_resolve, reject) => setTimeout(() => reject(new Error('tui ignored SIGHUP')), 8_000)),
    ])
    assert.equal(isPidAlive(servicePid), true)
    assert.equal((await readRegistryLock(home))?.pid, servicePid)
    assert.equal(await registryHealthy(registryBindUrl(lock)), true)
    third.terminal.close()
    terminal = undefined
  } finally {
    try {
      terminal?.close()
    } catch {
      // The PTY is already closed.
    }
    await stopProcess(servicePid)
    await rm(home, { recursive: true, force: true })
  }
})
