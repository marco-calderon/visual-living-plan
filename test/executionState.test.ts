import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { Database } from 'bun:sqlite'
import { applyExecutionChange, readExecutionPatch, type ExecutionState } from '../src/execution.ts'
import { browserHello, changeExecution, initPlan, planView, putSource, type PlanSql } from '../src/host/planRoom.ts'
import { applyLiveToPlan, type PlanRow } from '../src/offlineSync.ts'
import { registerHostedPlan } from '../src/registryClient.ts'
import { startRegistryServer } from '../src/registryService.ts'
import { LOCK_BANNER_TEXT } from '../src/lockBanner.ts'

const planPath = resolve('examples/rate-limit.plan.md')
const graph = { nodes: [{ id: 'implement', label: 'Implement', status: 'active' as const }] }

function sqlOf(db: Database): PlanSql {
  return {
    exec(query, ...bindings) {
      const statement = db.query(query)
      if (query.trim().toLowerCase().startsWith('select')) {
        return { toArray: () => statement.all(...bindings) as Array<Record<string, unknown>> }
      }
      statement.run(...bindings)
      return { toArray: () => [] }
    },
  }
}

test('start turns the run on, push keeps it as it is, and stop turns it off', () => {
  const started = applyExecutionChange(null, 'start', { step: 'Build', graph })
  assert.equal(started.active, true)
  assert.equal(started.step, 'Build')

  const pushed = applyExecutionChange(started, 'push', { detail: 'Tests pass' })
  assert.equal(pushed.active, true)
  assert.equal(pushed.step, 'Build')
  assert.equal(pushed.detail, 'Tests pass')
  assert.deepEqual(pushed.graph, graph)

  const stopped = applyExecutionChange(pushed, 'stop')
  assert.equal(stopped.active, false)
  // The last step and graph stay on the Workflow tab after the run.
  assert.equal(stopped.step, 'Build')
  assert.deepEqual(stopped.graph, graph)

  // A push after stop does not start the run again.
  assert.equal(applyExecutionChange(stopped, 'push', { step: 'Late' }).active, false)
  assert.equal(applyExecutionChange(null, 'start').step, 'Executing')
})

test('an execution patch keeps only the fields an agent may send', () => {
  assert.deepEqual(readExecutionPatch({ active: true, step: ' ', detail: 'D', graph: 'nope', planned: graph }), { detail: 'D' })
  assert.deepEqual(readExecutionPatch(null), {})
})

test('the hosted plan starts, pushes, and stops a run from the fields it is sent', () => {
  const sql = sqlOf(new Database(':memory:'))
  const source = readFileSync(planPath, 'utf8')
  initPlan(sql, { token: 'plan-token', title: 'Demo', mode: 'watch', tier: 'free', source })

  changeExecution(sql, 'start', { step: 'Build', graph })
  changeExecution(sql, 'push', { detail: 'Halfway' })
  let run = planView(sql).execution as ExecutionState
  assert.equal(run.active, true)
  assert.equal(run.step, 'Build')
  assert.equal(run.detail, 'Halfway')
  assert.deepEqual(run.graph, graph)

  changeExecution(sql, 'stop', {})
  run = planView(sql).execution as ExecutionState
  assert.equal(run.active, false)
  assert.equal(run.step, 'Build')
  assert.deepEqual(run.graph, graph)
})

test('an agent edit during a hosted run keeps the page locked', () => {
  const sql = sqlOf(new Database(':memory:'))
  initPlan(sql, { token: 'plan-token', title: 'Demo', mode: 'watch', tier: 'free', source: '# Demo\n' })
  changeExecution(sql, 'start', {})
  const saved = putSource(sql, { markdown: '# Demo, step 2\n', revision: planView(sql).revision })
  const plan = saved.outbound.find((item) => item.event === 'plan')?.data as { locked?: boolean }
  assert.equal(plan.locked, true)

  changeExecution(sql, 'stop', {})
  const after = putSource(sql, { markdown: '# Demo, done\n', revision: planView(sql).revision })
  assert.equal((after.outbound[0]?.data as { locked?: boolean }).locked, false)
})

test('a hosted page socket opens with the run, the mode, and the review', () => {
  const sql = sqlOf(new Database(':memory:'))
  const source = readFileSync(planPath, 'utf8')
  initPlan(sql, { token: 'plan-token', title: 'Demo', mode: 'review', tier: 'free', source })
  changeExecution(sql, 'start', { step: 'Build' })
  const hello = browserHello(sql)
  assert.equal(hello.event, 'hello')
  const data = hello.data as { mode: string; review: unknown; execution: ExecutionState }
  assert.equal(data.mode, 'review')
  assert.equal(data.review, null)
  assert.equal(data.execution.active, true)
  assert.equal(data.execution.step, 'Build')
  // Read without awaiting. The page reads the plan's workflow from GET /api/execution.
  assert.equal(data.execution.planned, undefined)
})

test('the device copy takes the run from hello', () => {
  const row = { locked: false, mode: 'watch', review: null } as unknown as PlanRow
  const live = applyLiveToPlan(row, 'hello', { mode: 'review', review: null, execution: { active: true } })
  assert.equal(live.locked, true)
  assert.equal(live.mode, 'review')
  const stopped = applyLiveToPlan(live, 'hello', { execution: { active: false } })
  assert.equal(stopped.locked, false)
  assert.equal(stopped.mode, 'review')
})

async function readUntil(response: Response, done: (text: string) => boolean): Promise<string> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let text = ''
  const deadline = Date.now() + 5000
  while (!done(text) && Date.now() < deadline) {
    const chunk = await reader.read()
    if (chunk.done) break
    text += decoder.decode(chunk.value)
  }
  await reader.cancel()
  return text
}

test('the local service starts, pushes, and stops a run, and a page stream opens with it', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-execution-'))
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, { planPath, mode: 'watch', cwd: process.cwd() })
    const post = async (action: string, body: unknown) => {
      const response = await fetch(new URL(`api/execution/${action}`, hosted.url), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      assert.equal(response.status, 200, await response.clone().text())
      return ((await response.json()) as { execution: ExecutionState }).execution
    }
    const started = await post('start', { step: 'Build', graph })
    assert.equal(started.active, true)
    const pushed = await post('push', { detail: 'Halfway' })
    assert.equal(pushed.active, true)
    assert.equal(pushed.step, 'Build')
    assert.equal(pushed.graph?.nodes.length, 1)

    const stream = await fetch(new URL('api/events', hosted.url))
    const hello = await readUntil(stream, (text) => text.includes('\n\n'))
    assert.match(hello, /^event: hello\n/)
    const payload = JSON.parse(hello.split('\n')[1]!.slice('data: '.length)) as { execution: ExecutionState; review: unknown }
    assert.equal(payload.execution.active, true)
    assert.ok('review' in payload)

    const stopped = await post('stop', {})
    assert.equal(stopped.active, false)
    assert.equal(stopped.step, 'Build')
    assert.equal(stopped.graph?.nodes.length, 1)

    // The page shows the run in place: the banner is there, hidden, and a start or stop does not reload.
    const page = await (await fetch(hosted.url)).text()
    assert.ok(page.includes(`data-lock-banner role="status" hidden>${LOCK_BANNER_TEXT}`))
    assert.doesNotMatch(page, /location\.reload\(\)/)
    await post('start', {})
    const live = await (await fetch(hosted.url)).text()
    assert.ok(live.includes(`data-lock-banner role="status">${LOCK_BANNER_TEXT}`))
    assert.match(live, /tab-panel plan-locked/)
  } finally {
    await registry.close()
    await rm(home, { recursive: true, force: true })
  }
})

/** Relative imports reachable from one module, static and dynamic. */
function reachable(entry: string): Set<string> {
  const seen = new Set<string>()
  const queue = [resolve(entry)]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/(?:from|import\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const spec = match[1]!
      if (/^import\s+type\b/m.test(text.slice(Math.max(0, match.index! - 200), match.index!).split('\n').pop() ?? '')) continue
      const base = resolve(file, '..', spec)
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
        try {
          readFileSync(candidate)
          if (!candidate.endsWith('.css')) queue.push(candidate)
          break
        } catch {
          // Try the next extension.
        }
      }
    }
  }
  return seen
}

test('the hosted plan reads its workflow and progress without the ELK layout a Worker cannot load', async () => {
  const files = [...reachable('src/host/planRoom.ts')].map((file) => file.replace(`${resolve('.')}/`, ''))
  assert.ok(!files.includes('src/elkRuntime.node.ts'), files.filter((file) => file.includes('layout') || file.includes('workflow')).join(', '))

  const sql = sqlOf(new Database(':memory:'))
  initPlan(sql, { token: 'plan-token', title: 'Demo', mode: 'watch', tier: 'free', source: readFileSync(planPath, 'utf8') })
  const { executionView, planProgress } = await import('../src/host/planRoom.ts')
  const view = await executionView(sql)
  assert.ok(view.planned && view.planned.nodes.length > 0, 'the Workflow tab gets the plan workflow')
  assert.ok(await planProgress(sql), 'the dashboard gets progress')
})

test('closing a hosted plan sends no JSON content type on its empty DELETE', async () => {
  const { closeCloudPlan } = await import('../src/cloudClient.ts')
  let seen: { method: string; type: string | null; auth: string | null } | undefined
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      seen = { method: request.method, type: request.headers.get('content-type'), auth: request.headers.get('authorization') }
      return Response.json({ ok: true })
    },
  })
  try {
    await closeCloudPlan(`http://127.0.0.1:${server.port}/plans/plan-1234/`, 'plan-token')
    assert.deepEqual(seen, { method: 'DELETE', type: null, auth: 'Bearer plan-token' })
  } finally {
    server.stop(true)
  }
})
