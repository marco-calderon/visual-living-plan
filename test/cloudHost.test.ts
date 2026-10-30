import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Database } from 'bun:sqlite'
import { fileURLToPath } from 'node:url'
import { allows, planCapReached } from '../cloud/src/access.ts'
import { defaultAccountSettings, mergeAccountSettings, readAccountSettings, saveAccountSettings } from '../cloud/src/accountSettings.ts'
import { renderDashboard } from '../cloud/src/dashboardPage.ts'
import { renderCloudPage } from '../cloud/src/page.ts'
import {
  ackEvents,
  initPlan,
  pendingEvents,
  putSource,
  StaleRevision,
  submitInteraction,
  type PlanSql,
} from '../cloud/src/planRoom.ts'
import { uploadSource } from '../src/cloudClient.ts'
import { cloudIdInSource, sourceWithCloudId } from '../src/cloudFrontmatter.ts'
import { readRegistryLock, type RegistryLock } from '../src/registryLock.ts'
import { localServiceUrl, rewriteToBindUrl } from '../src/registryClient.ts'

const entry = fileURLToPath(new URL('../src/cli.ts', import.meta.url))

test('the page after sign-in points back at the terminal', () => {
  const page = renderDashboard({
    email: 'person@example.com',
    name: 'Person',
    tier: 'free',
    settings: defaultAccountSettings(),
    plans: [{ id: 'plan1234', title: 'Demo', mode: 'watch' }],
  })
  assert.match(page, /Signed in as person@example.com/)
  assert.match(page, /live-plan serve path\/to\/work\.plan\.md --cloud/)
  assert.match(page, /data-host-panel="cloud"/)
  assert.match(page, /Save on this host/)
  assert.match(page, /\/plans\/plan1234\//)
  assert.doesNotMatch(page, /data-host-panel="local"/)
  assert.match(page, /--canvas:\s*#ffffff/)
  assert.doesNotMatch(page, /#f7f6f3/)
})

test('a hosted plan and a loopback plan show different panels', () => {
  const settings = { accent: '#1d4ed8', pageWidth: 'wide' as const, diffsTheme: 'soft', wrapCode: true }
  const assets = { planMdxHref: null, planMdxCss: [], selectorHref: null, selectorCss: [] }
  const hosted = renderCloudPage({
    basePath: '/plans/abc',
    title: 'Demo',
    source: '# Demo',
    mode: 'watch',
    responses: {},
    comments: [],
    review: null,
    accent: settings.accent,
    pageWidth: settings.pageWidth,
    diffsTheme: settings.diffsTheme,
    wrapCode: settings.wrapCode,
    owner: true,
    email: 'person@example.com',
    settings,
    assets,
  })
  assert.match(hosted, /data-host-panel="cloud"/)
  assert.match(hosted, /data-layout="wide"/)
  assert.match(hosted, /__LIVE_PLAN_HOST__ = "cloud"/)
  assert.doesNotMatch(hosted, /data-host-panel="local"/)
  const viewer = renderCloudPage({ ...hostedInput(settings, assets), owner: false, email: '' })
  assert.match(viewer, /does not use this account/)
  assert.doesNotMatch(viewer, /data-account-settings/)
})

function hostedInput(
  settings: { accent: string; pageWidth: 'default' | 'wide' | 'full'; diffsTheme: string; wrapCode: boolean },
  assets: { planMdxHref: null; planMdxCss: string[]; selectorHref: null; selectorCss: string[] },
) {
  return {
    basePath: '/plans/abc',
    title: 'Demo',
    source: '# Demo',
    mode: 'watch',
    responses: {},
    comments: [],
    review: null,
    accent: settings.accent,
    pageWidth: settings.pageWidth,
    diffsTheme: settings.diffsTheme,
    wrapCode: settings.wrapCode,
    owner: true,
    email: 'person@example.com',
    settings,
    assets,
  }
}

test('account settings stay on the hosted database', async () => {
  const db = new Database(':memory:')
  const saved = await saveAccountSettings(d1Of(db), 'user-1', { accent: '#b45309', pageWidth: 'full', wrapCode: true, diffsTheme: 'nope' })
  assert.equal(saved.accent, '#b45309')
  assert.equal(saved.pageWidth, 'full')
  assert.equal(saved.wrapCode, true)
  assert.equal(saved.diffsTheme, 'pierre')
  const again = await readAccountSettings(d1Of(db), 'user-1')
  assert.deepEqual(again, saved)
  const kept = mergeAccountSettings(again, { accent: 'not-a-color' })
  assert.equal(kept.accent, '#b45309')
})

function d1Of(db: Database): D1Database {
  return {
    prepare(sql: string) {
      const run = (...values: unknown[]) => {
        const statement = db.query(sql)
        return {
          async first<T>() {
            return (statement.get(...(values as never[])) as T | null) ?? null
          },
          async run() {
            statement.run(...(values as never[]))
            return { success: true }
          },
          async all<T>() {
            return { results: statement.all(...(values as never[])) as T[] }
          },
        }
      }
      return { ...run(), bind: (...values: unknown[]) => run(...values) }
    },
  } as unknown as D1Database
}

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

test('an https plan URL is not rewritten onto the local registry', async () => {
  const home = await mkdtemp(join(tmpdir(), 'living-plan-cloud-'))
  const lock: RegistryLock = {
    pid: process.pid,
    port: 9477,
    host: '127.0.0.1',
    url: 'http://127.0.0.1:9477',
    token: 'registry-token',
    startedAt: Date.now(),
  }
  await writeFile(join(home, 'registry.json'), JSON.stringify(lock))
  const published = 'https://plans.example/plans/abc12345/'
  assert.equal(rewriteToBindUrl(lock, published), published)
  assert.equal(await localServiceUrl(published, home), published)
  await rm(home, { recursive: true, force: true })
})

test('cloudId is written into frontmatter once', () => {
  const source = '---\ntitle: Demo\n---\n# Demo\n'
  const once = sourceWithCloudId(source, 'plan_12345678')
  assert.equal(cloudIdInSource(once), 'plan_12345678')
  assert.equal(sourceWithCloudId(once, 'plan_12345678'), once)
  assert.match(once, /title: Demo/)
})

test('a stale source upload retries once', async () => {
  const revisions: number[] = []
  const fetchImpl: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { revision: number }
    revisions.push(body.revision)
    if (revisions.length === 1) return Response.json({ revision: 4 }, { status: 409 })
    return Response.json({ revision: 5 })
  }
  const next = await uploadSource({
    planUrl: 'https://plans.example/plans/abc12345/',
    token: 'plan-token',
    markdown: '# Demo\n',
    revision: 1,
    fetchImpl,
  })
  assert.deepEqual(revisions, [1, 4])
  assert.equal(next, 5)
})

test('plan room stores a submission until it is acked', () => {
  const db = new Database(':memory:')
  const sql = sqlOf(db)
  initPlan(sql, { token: 'plan-token', title: 'Demo', mode: 'watch', tier: 'free', source: '# Demo\n' })
  assert.throws(() => putSource(sql, { markdown: '# Next\n', revision: 3 }), StaleRevision)
  const saved = putSource(sql, { markdown: '# Next\n', revision: 0 })
  assert.equal(saved.revision, 1)
  const sent = submitInteraction(sql, 'choice', { kind: 'choice', id: 'choice', optionId: 'a', label: 'A' })
  assert.equal(sent.outbound[0]?.event, 'notice')
  assert.equal(pendingEvents(sql).length, 1)
  const id = String((sent.outbound[0]?.data as { id: string }).id)
  ackEvents(sql, [id])
  assert.equal(pendingEvents(sql).length, 0)
})

test('tier caps and viewer access', () => {
  assert.equal(planCapReached('free', 1, false), true)
  assert.equal(planCapReached('free', 1, true), false)
  assert.equal(allows('viewer', 'register'), false)
  assert.equal(allows('viewer', 'submit'), true)
  assert.equal(allows('account', 'register'), true)
  assert.equal(allows('plan', 'upload'), true)
  assert.equal(allows(null, 'read'), false)
})

test('serve --cloud uploads with the account and plan bearers and does not start the registry', async () => {
  const home = await mkdtemp(join(tmpdir(), 'living-plan-cloud-'))
  let revision = 0
  let registerAuth = ''
  let uploadAuth = ''
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request, bunServer) {
      const url = new URL(request.url)
      if (request.headers.get('upgrade') === 'websocket') {
        if (request.headers.get('authorization') !== 'Bearer plan-token') return new Response('Sign in required', { status: 401 })
        bunServer.upgrade(request)
        return undefined
      }
      if (url.pathname === '/api/plans' && request.method === 'POST') {
        registerAuth = request.headers.get('authorization') ?? ''
        const id = 'plan_12345678'
        return Response.json({
          plan: { id, url: `http://127.0.0.1:${bunServer.port}/plans/${id}/`, token: 'plan-token', mode: 'watch' },
          revision: 0,
        })
      }
      if (url.pathname.endsWith('/source') && request.method === 'PUT') {
        uploadAuth = request.headers.get('authorization') ?? ''
        const body = (await request.json()) as { revision: number }
        if (body.revision !== revision) return Response.json({ revision }, { status: 409 })
        revision += 1
        return Response.json({ revision })
      }
      if (request.method === 'PUT') return Response.json({ ok: true })
      if (url.pathname.endsWith('/ack') && request.method === 'POST') return Response.json({ ok: true, delivered: ['evt_1'] })
      return new Response('Not found', { status: 404 })
    },
    websocket: {
      open(socket) {
        socket.send(
          JSON.stringify({
            event: 'hello',
            data: {
              pending: [
                {
                  id: 'evt_1',
                  seq: 1,
                  event: 'interaction',
                  data: { kind: 'choice', id: 'choice', optionId: 'a', label: 'A' },
                  createdAt: 1,
                  deliveredAt: null,
                },
              ],
            },
          }),
        )
      },
      message() {},
    },
  })
  await writeFile(
    join(home, 'cloud.json'),
    JSON.stringify({ account: { baseUrl: `http://127.0.0.1:${server.port}`, token: 'account-token' }, plans: {} }),
  )
  const plan = join(home, 'demo.plan.md')
  await writeFile(plan, '# Demo\n')
  const child = spawn(process.execPath, [entry, 'serve', plan, '--cloud', '--no-open'], {
    env: { ...process.env, LIVE_PLAN_HOME: home, HOME: home },
  })
  let stdout = ''
  child.stdout?.on('data', (chunk) => {
    stdout += String(chunk)
  })
  const code = await new Promise<number>((resolveExit, reject) => {
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`timed out\n${stdout}`))
    }, 8_000)
    child.on('exit', (exitCode) => {
      clearTimeout(timer)
      resolveExit(exitCode ?? 1)
    })
  })
  server.stop(true)
  assert.equal(code, 0)
  assert.equal(registerAuth, 'Bearer account-token')
  assert.equal(uploadAuth, 'Bearer plan-token')
  assert.match(stdout, /"event":"interaction"/)
  assert.equal(await readRegistryLock(home), null)
  const stored = cloudIdInSource(await readFile(plan, 'utf8'))
  assert.equal(stored, 'plan_12345678')
  await rm(home, { recursive: true, force: true })
})

test('serve --cloud without a session does not start the registry', async () => {
  const home = await mkdtemp(join(tmpdir(), 'living-plan-cloud-'))
  const plan = join(home, 'demo.plan.md')
  await writeFile(plan, '# Demo\n')
  const child = spawn(process.execPath, [entry, 'serve', plan, '--cloud', '--no-open'], {
    env: { ...process.env, LIVE_PLAN_HOME: home, HOME: home },
  })
  let stderr = ''
  child.stderr?.on('data', (chunk) => {
    stderr += String(chunk)
  })
  const code = await new Promise<number>((resolveExit) => {
    child.on('exit', (exitCode) => resolveExit(exitCode ?? 1))
  })
  assert.equal(code, 1)
  assert.match(stderr, /account login/)
  assert.equal(await readRegistryLock(home), null)
  await rm(home, { recursive: true, force: true })
})

test('serve --cloud rejects --no-registry', async () => {
  const home = await mkdtemp(join(tmpdir(), 'living-plan-cloud-'))
  const plan = join(home, 'demo.plan.md')
  await writeFile(plan, '# Demo\n')
  await writeFile(join(home, 'cloud.json'), JSON.stringify({ account: { baseUrl: 'http://127.0.0.1:9', token: 'account-token' }, plans: {} }))
  const child = spawn(process.execPath, [entry, 'serve', plan, '--cloud', '--no-registry', '--no-open'], {
    env: { ...process.env, LIVE_PLAN_HOME: home, HOME: home },
  })
  const code = await new Promise<number>((resolveExit) => {
    child.on('exit', (exitCode) => resolveExit(exitCode ?? 1))
  })
  assert.equal(code, 1)
  assert.equal(await readRegistryLock(home), null)
  await rm(home, { recursive: true, force: true })
})
