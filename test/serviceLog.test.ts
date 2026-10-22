import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { logPanelScript } from '../src/logPanel.ts'
import {
  acceptClientLog,
  clearLogs,
  formatServiceLogLines,
  installServiceLogCapture,
  listLogs,
  recordLog,
} from '../src/serviceLog.ts'
import { startRegistryServer } from '../src/registryService.ts'
import { startLivingPlanServer } from '../src/server.ts'

const fixture = join(import.meta.dir, '..', 'examples', 'rate-limit.plan.md')

test('the logs panel script parses', () => {
  new Function(logPanelScript())
})

test('recordLog keeps level, detail, and a repeated message', () => {
  clearLogs()
  const marker = `buffer-${Date.now()}`
  const first = recordLog({ level: 'warn', message: marker, source: 'plan', planId: 'plan-a', echo: false })
  const second = recordLog({
    level: 'warn',
    message: marker,
    detail: 'more',
    source: 'plan',
    planId: 'plan-a',
    echo: false,
  })
  assert.equal(second.id, first.id)
  assert.equal(second.repeat, 2)
  assert.equal(second.detail, 'more')

  const other = recordLog({ level: 'error', message: `${marker}-error`, source: 'server', echo: false })
  const warns = listLogs({ level: 'warn', planId: 'plan-a' })
  assert.equal(warns.some((entry) => entry.id === first.id), true)
  assert.equal(warns.some((entry) => entry.id === other.id), false)

  const unscoped = listLogs({ planId: 'plan-a', includeUnscoped: true })
  assert.equal(unscoped.some((entry) => entry.id === other.id), true)
  const scoped = listLogs({ planId: 'plan-a' })
  assert.equal(scoped.some((entry) => entry.id === other.id), false)
  clearLogs()
})

test('listLogs returns the newest entries first and caps the ring', () => {
  clearLogs()
  const planId = `ring-${Date.now()}`
  for (let index = 0; index < 520; index += 1) {
    recordLog({ level: 'log', message: `${planId}-${index}`, source: 'server', planId, echo: false })
  }
  const listed = listLogs({ planId, limit: 2 })
  assert.equal(listed.length, 2)
  assert.equal(listed[0]?.message, `${planId}-519`)
  assert.equal(listed[1]?.message, `${planId}-518`)
  assert.equal(listLogs({ planId }).some((entry) => entry.message === `${planId}-0`), false)
  clearLogs()
})

test('acceptClientLog rejects a bad level and stops after the budget', () => {
  clearLogs()
  const rejected = acceptClientLog({ level: 'debug', message: 'nope' }, undefined, { echo: false })
  assert.equal(rejected.status, 400)

  const missing = acceptClientLog({ level: 'log', message: '   ' }, undefined, { echo: false })
  assert.equal(missing.status, 400)

  for (let index = 0; index < 120; index += 1) {
    const accepted = acceptClientLog({ level: 'log', message: `budget-${index}` }, 'budget-plan', { echo: false })
    assert.equal(accepted.status, 200)
  }
  const blocked = acceptClientLog({ level: 'log', message: 'budget-overflow' }, 'budget-plan', { echo: false })
  assert.equal(blocked.status, 429)
  clearLogs()
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

test('console capture records a warning without a second echoed row', () => {
  clearLogs()
  installServiceLogCapture()
  const marker = `console-${Date.now()}`
  console.warn(marker, new Error('hidden stack'))
  const found = listLogs({ level: 'warn' }).filter((entry) => entry.message.includes(marker))
  assert.equal(found.length, 1)
  assert.match(found[0]?.detail ?? '', /hidden stack/)
  assert.equal(found[0]?.source, 'server')
  clearLogs()
})

test('a plan page exposes logs and keeps another plan out of them', async () => {
  clearLogs()
  const home = await mkdtemp(join(tmpdir(), 'live-plan-logs-'))
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value', localName: false })
  try {
    const dashboard = await fetch(new URL('/dashboard', registry.url))
    assert.equal(dashboard.status, 200)
    const dashboardHtml = await dashboard.text()
    assert.match(dashboardHtml, /data-log-panel/)
    assert.match(dashboardHtml, /data-log-show-plan="true"/)
    assert.match(dashboardHtml, /data-log-endpoint="\/api\/logs"/)

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
    assert.match(html, /data-tab-target="logs"/)
    assert.match(html, /data-log-count/)
    assert.match(html, new RegExp(`data-log-endpoint="/plans/${hosted.plan.id}/api/logs"`))

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

    recordLog({
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
    clearLogs()
  }
})

test('deleting the plan file is recorded as a reload error', async () => {
  clearLogs()
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
    clearLogs()
  }
})
