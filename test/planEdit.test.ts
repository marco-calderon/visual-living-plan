import assert from 'node:assert/strict'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { pendingFromHello, readAgentEvents } from '../src/agentEvents.ts'
import { registerHostedPlan } from '../src/registryClient.ts'
import { startRegistryServer } from '../src/registryService.ts'
import type { PlanSubmissionEvent } from '../src/types.ts'

const fixture = resolve('examples/rate-limit.plan.md')

async function hostedCopy() {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-edit-'))
  const planPath = join(home, 'edit.plan.md')
  await copyFile(fixture, planPath)
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  const hosted = await registerHostedPlan(registry.url, registry.token, { planPath, mode: 'watch' })
  return {
    home,
    planPath,
    hosted,
    async close() {
      await registry.close()
      await rm(home, { recursive: true, force: true })
    },
  }
}

function save(url: string, body: unknown) {
  return fetch(new URL('api/plan-mdx/source', url), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function pending(url: string, token: string): Promise<PlanSubmissionEvent[]> {
  const controller = new AbortController()
  return new Promise((resolvePending, reject) => {
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
}

test('a page edit writes the plan file and tells the agent', async () => {
  const plan = await hostedCopy()
  try {
    const base = await readFile(plan.planPath, 'utf8')
    const source = base.replace('title="Ship dashboards and alerts"', 'title="Ship dashboards"')
    const saved = await save(plan.hosted.url, { base, source })
    assert.equal(saved.status, 200)
    const payload = (await saved.json()) as { source?: string }
    assert.equal(payload.source, source)
    assert.equal(await readFile(plan.planPath, 'utf8'), source)

    const events = await pending(plan.hosted.url, plan.hosted.token)
    const edit = events.find((event) => event.event === 'edit')
    assert.ok(edit, 'the agent hears the edit')
    assert.equal((edit.data as { by?: string }).by, 'page')
  } finally {
    await plan.close()
  }
})

test('a page edit is refused when the file changed since the editor opened', async () => {
  const plan = await hostedCopy()
  try {
    const base = await readFile(plan.planPath, 'utf8')
    await writeFile(plan.planPath, base.replace('status="pending"', 'status="active"'))
    const saved = await save(plan.hosted.url, { base, source: `${base}\nMore.\n` })
    assert.equal(saved.status, 409)
    assert.notEqual(await readFile(plan.planPath, 'utf8'), `${base}\nMore.\n`)
  } finally {
    await plan.close()
  }
})

test('a page edit that does not compile is refused and the file is kept', async () => {
  const plan = await hostedCopy()
  try {
    const base = await readFile(plan.planPath, 'utf8')
    const saved = await save(plan.hosted.url, { base, source: `${base}\n<phase title="Open" status="pending">\n` })
    assert.equal(saved.status, 400)
    assert.equal(await readFile(plan.planPath, 'utf8'), base)
  } finally {
    await plan.close()
  }
})

test('a page edit needs both the source and the base', async () => {
  const plan = await hostedCopy()
  try {
    const saved = await save(plan.hosted.url, { source: 'x' })
    assert.equal(saved.status, 400)
  } finally {
    await plan.close()
  }
})
