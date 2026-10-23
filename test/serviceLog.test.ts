import './logHome.ts'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { clientLogScript } from '../src/clientLog.ts'
import { parsePlan } from '../src/parse.ts'
import {
  acceptClientLog,
  appLogHome,
  clearLogs,
  formatServiceLogLines,
  installServiceLogCapture,
  isLogDay,
  listLogs,
  localLogDay,
  recordLog,
} from '../src/serviceLog.ts'
import { startRegistryServer } from '../src/registryService.ts'
import { startLivingPlanServer } from '../src/server.ts'

const fixture = join(import.meta.dir, '..', 'examples', 'rate-limit.plan.md')
const repoRoot = join(import.meta.dir, '..')

test('the client log script parses and names no page control', () => {
  const script = clientLogScript('/plans/abc/api/logs')
  new Function(script)
  assert.match(script, /\/plans\/abc\/api\/logs/)
  assert.doesNotMatch(script, /data-log-panel|log-list|data-tab-target/)
})

test('recordLog writes the plan file and the daily registry file', async () => {
  await clearLogs()
  const marker = `buffer-${Date.now()}`
  const first = await recordLog({ level: 'warn', message: marker, source: 'plan', planId: 'plan-a', echo: false })
  const second = await recordLog({
    level: 'warn',
    message: marker,
    detail: 'more',
    source: 'plan',
    planId: 'plan-a',
    echo: false,
  })
  assert.notEqual(second.id, first.id)
  assert.equal(second.detail, 'more')

  const warns = await listLogs({ level: 'warn', planId: 'plan-a' })
  assert.equal(warns.filter((entry) => entry.message === marker).length, 2)
  assert.equal(warns.some((entry) => entry.id === first.id), true)

  const home = appLogHome()
  const registryText = await readFile(join(home, 'registry', `${localLogDay()}.log`), 'utf8')
  const planText = await readFile(join(home, 'plans', 'plan-a.log'), 'utf8')
  assert.match(registryText, new RegExp(marker))
  assert.match(planText, new RegExp(marker))
  assert.equal((await stat(join(home, 'registry'))).mode & 0o777, 0o700)
  assert.equal((await stat(home)).mode & 0o777, 0o700)

  const other = await recordLog({ level: 'error', message: `${marker}-error`, source: 'server', echo: false })
  const planAfter = await readFile(join(home, 'plans', 'plan-a.log'), 'utf8')
  assert.doesNotMatch(planAfter, new RegExp(`${marker}-error`))
  const unscoped = await listLogs({ planId: 'plan-a', includeUnscoped: true })
  assert.equal(unscoped.some((entry) => entry.id === other.id), true)
  const scoped = await listLogs({ planId: 'plan-a' })
  assert.equal(scoped.some((entry) => entry.id === other.id), false)
  await clearLogs()
})

test('listLogs returns the newest lines and keeps the older ones on disk', async () => {
  await clearLogs()
  const planId = `ring-${Date.now()}`
  const writes: Array<Promise<unknown>> = []
  for (let index = 0; index < 520; index += 1) {
    writes.push(recordLog({ level: 'log', message: `${planId}-${index}`, source: 'server', planId, echo: false }))
  }
  await Promise.all(writes)
  const listed = await listLogs({ planId, limit: 2 })
  assert.equal(listed.length, 2)
  assert.equal(listed[0]?.message, `${planId}-519`)
  assert.equal(listed[1]?.message, `${planId}-518`)
  assert.equal((await listLogs({ planId })).some((entry) => entry.message === `${planId}-0`), false)
  const file = await readFile(join(appLogHome(), 'plans', `${planId}.log`), 'utf8')
  assert.match(file, new RegExp(`${planId}-0`))
  await clearLogs()
})

test('acceptClientLog rejects a bad level and stops after the budget', async () => {
  await clearLogs()
  const rejected = await acceptClientLog({ level: 'debug', message: 'nope' }, undefined, { echo: false })
  assert.equal(rejected.status, 400)

  const missing = await acceptClientLog({ level: 'log', message: '   ' }, undefined, { echo: false })
  assert.equal(missing.status, 400)

  const accepted = []
  for (let index = 0; index < 120; index += 1) {
    accepted.push(acceptClientLog({ level: 'log', message: `budget-${index}` }, 'budget-plan', { echo: false }))
  }
  const results = await Promise.all(accepted)
  assert.equal(results.every((result) => result.status === 200), true)
  const blocked = await acceptClientLog({ level: 'log', message: 'budget-overflow' }, 'budget-plan', { echo: false })
  assert.equal(blocked.status, 429)
  await clearLogs()
})

test('formatServiceLogLines prints an empty list and a repeated error', () => {
  assert.equal(formatServiceLogLines([]), 'No logs.')
  const lines = formatServiceLogLines([
    {
      id: 'log_1',
      level: 'error',
      message: 'disk gone',
      detail: 'ENOENT',
      source: 'plan',
      planId: 'abc',
      at: Date.parse('2026-10-22T18:00:00.000Z'),
      repeat: 3,
    },
  ])
  assert.match(lines, /2026-10-22T18:00:00.000Z error plan plan=abc ×3 disk gone/)
  assert.match(lines, /ENOENT/)
})

test('console capture records a warning without a second echoed row', async () => {
  await clearLogs()
  installServiceLogCapture()
  const marker = `console-${Date.now()}`
  console.warn(marker, new Error('hidden stack'))
  const found = (await listLogs({ level: 'warn' })).filter((entry) => entry.message.includes(marker))
  assert.equal(found.length, 1)
  assert.match(found[0]?.detail ?? '', /hidden stack/)
  assert.equal(found[0]?.source, 'server')
  await clearLogs()
})

test('a broken fence and a missing day file are readable from disk', async () => {
  await clearLogs()
  assert.equal(isLogDay('2020-01-02'), true)
  assert.equal(isLogDay('2026-13-40'), false)
  assert.throws(() => parsePlan('```phase\n[\n```\n', 'bad.plan.md'))
  const parsed = await listLogs({ level: 'error' })
  assert.equal(parsed.some((entry) => entry.source === 'parse' && entry.message.startsWith('Failed to parse the plan:')), true)

  const home = appLogHome()
  const dir = join(home, 'registry')
  await mkdir(dir, { recursive: true })
  const line = JSON.stringify({
    id: 'log_old',
    level: 'info',
    levelName: 'log',
    message: 'kept-from-file',
    source: 'server',
    at: Date.parse('2020-01-02T12:00:00.000Z'),
    seq: 1,
  })
  await writeFile(join(dir, '2020-01-02.log'), `not json\n${line}\n{"level":"error"}\n`)
  const logs = await listLogs({ day: '2020-01-02' })
  assert.equal(logs.length, 1)
  assert.equal(logs[0]?.level, 'log')
  assert.equal(logs[0]?.message, 'kept-from-file')
  assert.equal((await listLogs()).some((entry) => entry.message === 'kept-from-file'), false)
  await clearLogs()
})

test('live-plan logs reads the files without a running service', async () => {
  await clearLogs()
  const home = appLogHome()
  await recordLog({
    level: 'error',
    message: 'from-disk',
    source: 'plan',
    planId: 'abcd1234',
    echo: false,
  })
  const cli = [join(repoRoot, 'src', 'cli.ts')]
  const env = { ...process.env, LIVE_PLAN_LOG_HOME: home }
  const listed = spawnSync(process.execPath, [...cli, 'logs', '--level', 'error'], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    timeout: 20_000,
  })
  assert.equal(listed.status, 0, listed.stderr)
  assert.match(listed.stdout, /from-disk/)

  const plan = spawnSync(process.execPath, [...cli, 'logs', '--url', 'http://127.0.0.1:9/plans/abcd1234/', '--day', '2020-01-02'], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    timeout: 20_000,
  })
  assert.equal(plan.status, 0, plan.stderr)
  assert.match(plan.stdout, /from-disk/)

  const missingUrl = spawnSync(process.execPath, [...cli, 'logs', '--url', 'http://127.0.0.1:9/'], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    timeout: 20_000,
  })
  assert.equal(missingUrl.status, 1)
  assert.match(missingUrl.stderr, /Omit --url/)

  const badDay = spawnSync(process.execPath, [...cli, 'logs', '--day', '2026-13-40'], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    timeout: 20_000,
  })
  assert.equal(badDay.status, 1)
  assert.match(badDay.stderr, /YYYY-MM-DD/)

  const empty = await mkdtemp(join(tmpdir(), 'live-plan-empty-logs-'))
  try {
    const none = spawnSync(process.execPath, [...cli, 'logs'], {
      cwd: repoRoot,
      env: { ...process.env, LIVE_PLAN_LOG_HOME: empty },
      encoding: 'utf8',
      timeout: 20_000,
    })
    assert.equal(none.status, 0, none.stderr)
    assert.match(none.stdout, /No logs\./)
  } finally {
    await rm(empty, { recursive: true, force: true })
  }
  await clearLogs()
})

test('logs stay off the page and one plan does not see another plan', async () => {
  await clearLogs()
  const home = await mkdtemp(join(tmpdir(), 'live-plan-logs-'))
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  try {
    const dashboard = await fetch(new URL('/dashboard', registry.url))
    assert.equal(dashboard.status, 200)
    const dashboardHtml = await dashboard.text()
    assert.doesNotMatch(dashboardHtml, /data-log-panel|data-tab-target="logs"|Errors, warnings, and logs/)

    const registered = await fetch(new URL('/api/plans', registry.url), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${registry.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ planPath: fixture, mode: 'watch' }),
    })
    assert.equal(registered.status, 200)
    const hosted = (await registered.json()) as { plan: { id: string; url: string } }
    const page = await fetch(hosted.plan.url)
    const html = await page.text()
    assert.doesNotMatch(html, /data-tab-target="logs"|data-log-panel|data-log-count/)
    assert.match(html, new RegExp(`/plans/${hosted.plan.id}/api/logs`))

    const posted = await fetch(new URL('api/logs', hosted.plan.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        level: 'error',
        message: `page-boom-${hosted.plan.id}`,
        detail: 'at main.tsx:1',
        source: 'server',
      }),
    })
    assert.equal(posted.status, 200)
    const created = (await posted.json()) as { log: { source: string; planId: string; detail: string } }
    assert.equal(created.log.source, 'browser')
    assert.equal(created.log.planId, hosted.plan.id)
    assert.equal(created.log.detail, 'at main.tsx:1')

    await recordLog({
      level: 'error',
      message: `other-plan-${hosted.plan.id}`,
      source: 'plan',
      planId: 'other-plan-id',
      echo: false,
    })

    const planLogs = (await (await fetch(new URL('api/logs?level=error', hosted.plan.url))).json()) as {
      logs: Array<{ message: string; planId?: string }>
    }
    assert.equal(
      planLogs.logs.some((entry) => entry.message === `page-boom-${hosted.plan.id}`),
      true,
    )
    assert.equal(
      planLogs.logs.some((entry) => entry.message === `other-plan-${hosted.plan.id}`),
      false,
    )

    const serviceLogs = (await (await fetch(new URL('/api/logs?level=error', registry.url))).json()) as {
      logs: Array<{ message: string }>
    }
    assert.equal(
      serviceLogs.logs.some((entry) => entry.message === `page-boom-${hosted.plan.id}`),
      true,
    )
    assert.equal(
      serviceLogs.logs.some((entry) => entry.message === `other-plan-${hosted.plan.id}`),
      true,
    )

    const limited = (await (await fetch(new URL('/api/logs?limit=1', registry.url))).json()) as { logs: unknown[] }
    assert.equal(limited.logs.length, 1)

    const badLevel = await fetch(new URL('/api/logs?level=debug', registry.url))
    assert.equal(badLevel.status, 400)
    const badLimit = await fetch(new URL('/api/logs?limit=0', registry.url))
    assert.equal(badLimit.status, 400)
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
    await clearLogs()
  }
})

test('deleting the plan file is recorded as a reload error', async () => {
  await clearLogs()
  const dir = await mkdtemp(join(tmpdir(), 'live-plan-reload-'))
  const planPath = join(dir, 'reload.plan.md')
  await writeFile(planPath, await readFile(fixture))
  const server = await startLivingPlanServer({ planPath, mode: 'watch', port: 0, host: '127.0.0.1' })
  try {
    await unlink(planPath)
    const started = Date.now()
    let seen = false
    while (Date.now() - started < 2_000) {
      const body = (await (await fetch(new URL('/api/logs?level=error', server.url))).json()) as {
        logs: Array<{ message: string }>
      }
      seen = body.logs.some((entry) => entry.message.includes('Failed to reload plan'))
      if (seen) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.equal(seen, true)
  } finally {
    await server.close()
    await rm(dir, { recursive: true, force: true })
    await clearLogs()
  }
})

test('execution start, stop, and a graph without nodes are logged', async () => {
  await clearLogs()
  const dir = await mkdtemp(join(tmpdir(), 'live-plan-exec-log-'))
  const planPath = join(dir, 'exec.plan.md')
  await writeFile(planPath, await readFile(fixture))
  const server = await startLivingPlanServer({ planPath, mode: 'watch', port: 0, host: '127.0.0.1' })
  try {
    const started = await fetch(new URL('/api/execution', server.url), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: true, step: 'Build the gate', graph: { title: 'bad' } }),
    })
    assert.equal(started.status, 200)
    const warnings = (await (await fetch(new URL('/api/logs?level=warn', server.url))).json()) as {
      logs: Array<{ message: string }>
    }
    assert.equal(warnings.logs.some((entry) => entry.message === 'Execution graph has no nodes array'), true)
    const info = (await (await fetch(new URL('/api/logs?level=log', server.url))).json()) as {
      logs: Array<{ message: string; source: string }>
    }
    assert.equal(info.logs.some((entry) => entry.message === 'Execution started: Build the gate' && entry.source === 'execution'), true)

    const stopped = await fetch(new URL('/api/execution/stop', server.url), { method: 'POST' })
    assert.equal(stopped.status, 200)
    const afterStop = (await (await fetch(new URL('/api/logs?level=log', server.url))).json()) as {
      logs: Array<{ message: string }>
    }
    assert.equal(afterStop.logs.some((entry) => entry.message.startsWith('Execution stopped')), true)
  } finally {
    await server.close()
    await rm(dir, { recursive: true, force: true })
    await clearLogs()
  }
})
