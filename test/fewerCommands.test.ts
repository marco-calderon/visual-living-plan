import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { Database } from 'bun:sqlite'
import {
  ackEvents,
  changeExecution,
  initPlan,
  pendingEvents,
  planView,
  putSource,
  settleRun,
  submitComment,
  submitReview,
  type PlanSql,
} from '../src/host/planRoom.ts'
import { planIdForPath } from '../src/planId.ts'
import { planFileArg, positionalArgs, resolvePlanUrl } from '../src/planTarget.ts'
import { registerHostedPlan } from '../src/registryClient.ts'
import { startRegistryServer } from '../src/registryService.ts'
import { nextRunState } from '../src/runFollow.ts'

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

/** A plan with two phases, both on the workflow. */
function smallPlan(build: string, ship: string): string {
  return `---
title: Small run
---
# Small run

<workflow id="flow" title="Run">
\`\`\`workflow
build | Build | build
ship | Ship | ship
--
build -> ship
\`\`\`
</workflow>

<phase id="build" title="Build" status="${build}">
Build it.
</phase>

<phase id="ship" title="Ship" status="${ship}">
Ship it.
</phase>
`
}

function sqlOf(db: Database): PlanSql {
  return {
    exec(query, ...bindings) {
      const statement = db.query(query)
      if (query.trim().toLowerCase().startsWith('select')) {
        return { toArray: () => statement.all(...(bindings as never[])) as Array<Record<string, unknown>> }
      }
      statement.run(...(bindings as never[]))
      return { toArray: () => [] }
    },
  }
}

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
    const timer = setTimeout(() => child.kill('SIGKILL'), 15_000)
    child.once('exit', (status) => {
      clearTimeout(timer)
      resolveExit({ status, stdout, stderr })
    })
  })
}

async function waitUntil(check: () => Promise<boolean>, timeoutMs = 6_000): Promise<void> {
  const started = Date.now()
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for the condition')
    await delay(50)
  }
}

async function runActive(url: string): Promise<boolean> {
  const response = await fetch(new URL('api/execution', url))
  return ((await response.json()) as { active?: boolean }).active === true
}

test('a plan command finds its plan from the file, or from --url', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-target-'))
  try {
    const local = join(home, 'local.plan.md')
    const hosted = join(home, 'hosted.plan.md')
    await writeFile(local, '# Local\n')
    await writeFile(hosted, '---\ncloudId: abc12345\n---\n# Hosted\n')
    await writeFile(
      join(home, 'cloud.json'),
      JSON.stringify({ plans: { abc12345: { id: 'abc12345', url: 'https://plans.example/plans/abc12345/', token: 't', planPath: '/elsewhere/hosted.plan.md', revision: 0 } } }),
    )
    // No service running: the id the service gives that path, on the default address.
    assert.equal(await resolvePlanUrl(['--follow', local], home), `http://127.0.0.1:9477/plans/${planIdForPath(local)}/`)
    // The hosted record is found by the cloudId in the file, even after the file moved.
    assert.equal(await resolvePlanUrl([hosted], home), 'https://plans.example/plans/abc12345/')
    assert.equal(await resolvePlanUrl(['--plan', hosted], home), 'https://plans.example/plans/abc12345/')
    assert.equal(await resolvePlanUrl(['--url', 'http://x/plans/y/', local], home), 'http://x/plans/y/')
    assert.equal(await resolvePlanUrl(['--follow'], home), null)
    await assert.rejects(resolvePlanUrl([join(home, 'missing.plan.md')], home), /No plan file/)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('a flag value that ends in .md is not taken for the plan file', () => {
  assert.deepEqual(positionalArgs(['cmt_1', '--text', 'see notes.md', 'work.plan.md', '--keep-open']), ['cmt_1', 'work.plan.md'])
  assert.equal(planFileArg(['cmt_1', '--text', 'see notes.md', '--outcome', 'issues', 'work.plan.md']), 'work.plan.md')
  assert.equal(planFileArg(['review', '--iteration', '2']), undefined)
})

test('events marks a comment in progress, and reply answers and closes it', { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-reply-'))
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  try {
    const planPath = join(home, 'work.plan.md')
    await writeFile(planPath, smallPlan('pending', 'pending'))
    const hosted = await registerHostedPlan(registry.url, registry.token, { planPath, mode: 'comment', cwd: home })
    const comment = async (text: string) => {
      const response = await fetch(new URL('api/comments', hosted.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ partId: 'phase:build/paragraph:1', kind: 'paragraph', text }),
      })
      return ((await response.json()) as { comment: { id: string } }).comment.id
    }
    const comments = async () =>
      ((await (await fetch(new URL('api/plan', hosted.url))).json()) as { comments: Array<Record<string, unknown>> }).comments

    const first = await comment('Rename the step.')
    const second = await comment('Is this tested?')
    // The plan file names the plan. No --url, no --token.
    const events = await runCli(home, ['events', planPath])
    assert.equal(events.status, 0, events.stderr)
    assert.match(events.stdout, /Rename the step\./)
    const received = await comments()
    assert.ok(received.every((entry) => typeof entry.addressingAt === 'number'))

    const replied = await runCli(home, ['reply', first, planPath, '--text', 'Renamed to Compile.'])
    assert.equal(replied.status, 0, replied.stderr)
    const kept = await runCli(home, ['reply', second, planPath, '--text', 'Checking.', '--keep-open'])
    assert.equal(kept.status, 0, kept.stderr)
    const after = await comments()
    const answered = after.find((entry) => entry.id === first)!
    const open = after.find((entry) => entry.id === second)!
    assert.equal(answered.outcome, 'implemented')
    assert.equal(typeof answered.addressedAt, 'number')
    assert.equal((answered.replies as Array<{ text: string }>)[0]?.text, 'Renamed to Compile.')
    assert.equal(open.addressedAt ?? null, null)
    assert.equal((open.replies as Array<{ text: string }>)[0]?.text, 'Checking.')

    const errored = await runCli(home, ['reply', second, planPath, '--text', 'Tests fail on CI.', '--outcome', 'errored'])
    assert.equal(errored.status, 0, errored.stderr)
    assert.equal((await comments()).find((entry) => entry.id === second)?.outcome, 'errored')
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('after approval the local run starts and ends with the phases in the file', { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-run-'))
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  try {
    const planPath = join(home, 'work.plan.md')
    await writeFile(planPath, smallPlan('pending', 'pending'))
    const hosted = await registerHostedPlan(registry.url, registry.token, { planPath, mode: 'review', cwd: home })

    // Before approval, an active phase does not start a run.
    await writeFile(planPath, smallPlan('active', 'pending'))
    await delay(600)
    assert.equal(await runActive(hosted.url), false)

    const approved = await fetch(new URL('api/review', hosted.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    })
    assert.equal(approved.status, 200)
    // The approval alone starts nothing, even with a phase already active. The agent's next edit does.
    await delay(300)
    assert.equal(await runActive(hosted.url), false)
    await writeFile(planPath, smallPlan('active', 'active'))
    await waitUntil(() => runActive(hosted.url))

    await writeFile(planPath, smallPlan('done', 'done'))
    await waitUntil(async () => !(await runActive(hosted.url)))

    // Set back to active, the plan starts the run again.
    await writeFile(planPath, smallPlan('done', 'active'))
    await waitUntil(() => runActive(hosted.url))

    // An explicit stop is the agent's call: later edits do not start the run again.
    const stopped = await runCli(home, ['execution', 'stop', planPath])
    assert.equal(stopped.status, 0, stopped.stderr)
    await writeFile(planPath, smallPlan('active', 'pending'))
    await delay(600)
    assert.equal(await runActive(hosted.url), false)
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('approving a gate starts no run, so the page can still comment', { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-gate-'))
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  try {
    // The sample plan already has a phase marked active while it asks for approval.
    const hosted = await registerHostedPlan(registry.url, registry.token, {
      planPath: resolve('examples/rate-limit.plan.md'),
      mode: 'watch',
      cwd: process.cwd(),
    })
    // The page sends its writes with an idempotency key, and those are refused while a run is on.
    const post = (path: string, body: unknown, key: string) =>
      fetch(new URL(path, hosted.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify(body),
      })
    const gate = await post('api/interactions/proceed-implement', { kind: 'approve', id: 'proceed-implement', approved: true }, 'gate-1')
    assert.equal(gate.status, 200)
    assert.equal(await runActive(hosted.url), false)
    const comment = await post('api/comments', { partId: 'callout:redis-dependency/label', kind: 'label', text: 'Call out the fail-open choice' }, 'comment-1')
    assert.equal(comment.status, 200, await comment.clone().text())
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

test('a forgotten execution stop ends the run once every step is done', () => {
  const planned = { nodes: [{ id: 'a', label: 'A', status: 'done' as const }] }
  assert.deepEqual(nextRunState({ active: true, planned }), { active: false })
  assert.equal(nextRunState({ active: false, planned }), null)
  const started = { nodes: [{ id: 'a', label: 'A', status: 'active' as const }, { id: 'b', label: 'B' }] }
  assert.equal(nextRunState({ active: false, planned: started }), null)
  // Only a new plan source may start it.
  assert.equal(nextRunState({ active: false, planned: started, follow: 'armed' }), null)
  assert.deepEqual(nextRunState({ active: false, planned: started, follow: 'armed' }, { mayStart: true }), { active: true })
  assert.equal(nextRunState({ active: false, planned: started, follow: 'off' }, { mayStart: true }), null)
})

test('a hosted plan follows its file after approval, and marks delivered comments in progress', async () => {
  const sql = sqlOf(new Database(':memory:'))
  initPlan(sql, { token: 'plan-token', title: 'Small run', mode: 'review', tier: 'free', source: smallPlan('pending', 'pending') })
  const active = () => Boolean((planView(sql).execution as { active?: boolean } | null)?.active)
  const upload = (source: string) => putSource(sql, { markdown: source, revision: planView(sql).revision })

  upload(smallPlan('active', 'pending'))
  assert.equal(await settleRun(sql, true), false)
  submitReview(sql, { decision: 'approve' })
  // The approval arms the run but starts nothing. The next upload does.
  assert.equal(await settleRun(sql), false)
  upload(smallPlan('active', 'active'))
  assert.equal(await settleRun(sql, true), true)
  assert.equal(active(), true)

  upload(smallPlan('done', 'failed'))
  assert.equal(await settleRun(sql, true), true)
  assert.equal(active(), false)
  upload(smallPlan('done', 'active'))
  assert.equal(await settleRun(sql, true), true)
  assert.equal(active(), true)

  changeExecution(sql, 'stop', {})
  upload(smallPlan('active', 'pending'))
  assert.equal(await settleRun(sql, true), false)
  assert.equal(active(), false)

  const posted = submitComment(sql, { partId: 'phase:build/paragraph:1', kind: 'paragraph', text: 'Rename it.' })
  const commentId = (posted.body as { comment: { id: string } }).comment.id
  const row = pendingEvents(sql).find((event) => event.event === 'comment')!
  const acked = ackEvents(sql, [String(row.id)])
  assert.equal(acked.outbound.length, 1)
  const stored = (planView(sql).comments as Array<{ id: string; addressingAt?: number }>).find((entry) => entry.id === commentId)
  assert.equal(typeof stored?.addressingAt, 'number')
})
