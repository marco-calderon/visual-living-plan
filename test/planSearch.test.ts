import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { Database } from 'bun:sqlite'
import { allows } from '../src/host/access.ts'
import { accountSearch } from '../src/host/accountSearch.ts'
import { hostedSearch } from '../src/host/hostedSearch.ts'
import { initPlan, rememberPlanId, type PlanSql } from '../src/host/planRoom.ts'
import { publishPlanVersion } from '../src/host/planVersions.ts'
import {
  DASHBOARD_PLAN_LIMIT,
  SEARCH_HIT_LIMIT,
  SEARCH_TERM_LIMIT,
  dashboardSearchParams,
  searchPlans,
  SearchRequestError,
  parseSearchQuery,
  parseSearchVersion,
  searchPlanDocuments,
  searchPlanSource,
  visibleText,
} from '../src/planSearch.ts'
import { registerHostedPlan } from '../src/registryClient.ts'
import { startRegistryServer } from '../src/registryService.ts'

const examplePath = resolve('examples/rate-limit.plan.md')

test('a query keeps quoted phrases, lowercases, and drops duplicates', () => {
  assert.deepEqual(parseSearchQuery('Redis  "Fail   Open" redis'), ['redis', 'fail open'])
  assert.throws(() => parseSearchQuery('   '), SearchRequestError)
  assert.throws(() => parseSearchQuery('x'.repeat(201)), SearchRequestError)
  const many = Array.from({ length: SEARCH_TERM_LIMIT + 1 }, (_, n) => `t${n}`).join(' ')
  assert.throws(() => parseSearchQuery(many), /at most 10 terms/)
})

test('the version parameter is live by default', () => {
  assert.equal(parseSearchVersion(undefined), 'live')
  assert.equal(parseSearchVersion(''), 'live')
  assert.equal(parseSearchVersion('all'), 'all')
  assert.equal(parseSearchVersion('3'), 3)
  assert.throws(() => parseSearchVersion('0'), SearchRequestError)
  assert.throws(() => parseSearchVersion('latest'), SearchRequestError)
})

test('tag and attribute names are not searched, visible attribute values are', () => {
  assert.equal(visibleText('<phase id="design" title="Confirm design" status="done">').trim(), 'Confirm design')
  assert.equal(visibleText('```ts').trim(), '')
  const source = readFileSync(examplePath, 'utf8')
  assert.equal(searchPlanSource(source, ['status']).hits.some((hit) => hit.type === 'phase'), false)
})

test('every term must be in the same block unless match is any', async () => {
  const source = await readFile(examplePath, 'utf8')
  const both = searchPlanSource(source, ['redis', 'fail open'])
  assert.equal(both.parsed, true)
  assert.deepEqual(
    both.hits.map((hit) => [hit.type, hit.blockId, hit.line]),
    [['choice', 'fail-mode', 95]],
  )
  assert.deepEqual(both.hits[0]?.matched, ['redis', 'fail open'])

  const any = searchPlanSource(source, ['retry-after', 'dashboard'], 'any')
  assert.ok(any.hits.length >= 3)
  // Blocks with more distinct terms come first, then by position.
  for (let n = 1; n < any.hits.length; n += 1) {
    const before = any.hits[n - 1]!
    const after = any.hits[n]!
    assert.ok(before.matched.length > after.matched.length || (before.matched.length === after.matched.length && before.line <= after.line))
  }
})

test('hits carry the block, its title, the file line, and a snippet', async () => {
  const source = await readFile(examplePath, 'utf8')
  const lines = source.split('\n')
  const hits = searchPlanSource(source, ['429']).hits
  assert.deepEqual(
    hits.map((hit) => hit.blockId),
    ['design', 'implement', 'observe', 'done-when'],
  )
  for (const hit of hits) assert.match(lines[hit.line - 1]!.toLowerCase(), /429/)
  assert.equal(hits[0]?.title, 'Confirm limiter design')
  assert.match(hits[0]!.snippet, /429/)
  const heading = searchPlanSource(source, ['sliding-window']).hits[0]
  assert.equal(heading?.type, 'markdown')
  assert.equal(heading?.title, 'Rate limiting rollout')
})

test('a version that no longer parses is searched line by line', () => {
  const legacy = '# Old\n\n{% phase id="a" title="Old" %}\nRedis was the plan.\n{% /phase %}\n'
  const result = searchPlanSource(legacy, ['redis'])
  assert.equal(result.parsed, false)
  assert.deepEqual(result.hits.map((hit) => [hit.type, hit.line]), [['line', 4]])
  assert.equal(searchPlanSource(legacy, ['redis', 'missing']).hits.length, 0)
})

test('only the live plan is searched unless a version is asked for', () => {
  const live = { seq: 'live' as const, title: 'Now', source: '# Now\n\nRedis stays.\n', createdAt: null }
  const saved = [
    { seq: 1, title: 'First', source: '# First\n\nRedis first.\n', createdAt: 1 },
    { seq: 2, title: 'Now', source: live.source, createdAt: 2 },
  ]
  const base = { planId: 'plan1234', query: 'redis', terms: ['redis'], match: 'all' as const, live, saved }
  assert.deepEqual(searchPlanDocuments({ ...base, version: 'live' }).versions.map((version) => version.seq), ['live'])
  assert.deepEqual(searchPlanDocuments({ ...base, version: 1 }).versions.map((version) => version.seq), [1])
  // Version 2 equals the live source, so it is folded into the live result.
  assert.deepEqual(searchPlanDocuments({ ...base, version: 'all' }).versions.map((version) => version.seq), ['live', 1])
})

test('the local service searches the live plan and saved versions', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-search-'))
  const previousHome = process.env.LIVE_PLAN_HOME
  process.env.LIVE_PLAN_HOME = home
  const planPath = join(home, 'search.plan.md')
  await copyFile(examplePath, planPath)
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, { planPath, mode: 'watch', cwd: home })
    const search = (params: Record<string, string>) => fetch(new URL(`api/search?${new URLSearchParams(params)}`, hosted.url))

    const live = await search({ q: 'redis "fail open"' })
    assert.equal(live.status, 200)
    const body = (await live.json()) as { version: string; versions: Array<{ seq: unknown; hits: Array<{ blockId?: string }> }> }
    assert.equal(body.version, 'live')
    assert.deepEqual(body.versions.map((version) => version.seq), ['live'])
    assert.equal(body.versions[0]?.hits[0]?.blockId, 'fail-mode')

    const original = await readFile(planPath, 'utf8')
    await writeFile(planPath, original.replace('Fail open', 'Stay available').replace(/Prefer availability\./, 'Keep serving.'))
    await waitFor(async () => {
      const next = (await (await search({ q: 'stay available' })).json()) as { versions: Array<{ hits: unknown[] }> }
      return (next.versions[0]?.hits.length ?? 0) > 0
    })

    assert.equal(((await (await search({ q: '"fail open"' })).json()) as { versions: Array<{ hits: unknown[] }> }).versions[0]?.hits.length, 0)
    const first = (await (await search({ q: '"fail open"', version: '1' })).json()) as { versions: Array<{ seq: unknown; hits: unknown[] }> }
    assert.deepEqual(first.versions.map((version) => version.seq), [1])
    assert.equal(first.versions[0]?.hits.length, 1)
    const all = (await (await search({ q: '"fail open"', version: 'all' })).json()) as { versions: Array<{ seq: unknown; hits: unknown[] }> }
    assert.deepEqual(all.versions.map((version) => version.seq), ['live', 1])

    assert.equal((await search({ q: 'redis', version: '99' })).status, 404)
    assert.equal((await search({ q: '' })).status, 400)
    assert.equal((await search({ q: 'redis', match: 'some' })).status, 400)
  } finally {
    await registry.close()
    if (previousHome === undefined) delete process.env.LIVE_PLAN_HOME
    else process.env.LIVE_PLAN_HOME = previousHome
    await rm(home, { recursive: true, force: true })
  }
})

function runCli(home: string, args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, ['src/cli.ts', ...args], {
      cwd: resolve('.'),
      env: { ...process.env, LIVE_PLAN_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.on('error', fail)
    child.on('close', (status) => done({ status, stdout, stderr }))
  })
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await check()) return
    await new Promise((done) => setTimeout(done, 50))
  }
  throw new Error('Timed out waiting for the plan to reload')
}

test('live-plan search prints hits, takes repeated --query, and exits 0, 2, or 1', { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-search-cli-'))
  const previousHome = process.env.LIVE_PLAN_HOME
  process.env.LIVE_PLAN_HOME = home
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  const cli = (...args: string[]) => runCli(home, ['search', ...args])
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, { planPath: examplePath, mode: 'watch', cwd: process.cwd() })
    const found = await cli('--url', hosted.url, '--query', 'redis', '-q', '"fail open"')
    assert.equal(found.status, 0, found.stderr)
    assert.match(found.stdout, /^live {2}Rate limiting rollout$/m)
    assert.match(found.stdout, /choice {2}fail-mode {2}L95 /)
    assert.match(found.stdout, /1 match in live\./)

    const json = await cli('--url', hosted.url, '--query', 'retry-after dashboard', '--any', '--json')
    assert.equal(json.status, 0, json.stderr)
    const parsed = JSON.parse(json.stdout) as { match: string; terms: string[]; version: string }
    assert.equal(parsed.match, 'any')
    assert.deepEqual(parsed.terms, ['retry-after', 'dashboard'])
    assert.equal(parsed.version, 'live')

    const none = await cli('--url', hosted.url, '--query', 'kubernetes')
    assert.equal(none.status, 2)
    assert.match(none.stdout, /No matches for "kubernetes" in live\./)

    const saved = await cli('--url', hosted.url, '--query', 'redis', '--version', '1')
    assert.equal(saved.status, 0, saved.stderr)
    assert.match(saved.stdout, /^v1 {2}Rate limiting rollout$/m)

    const missing = await cli('--url', hosted.url, '--query', 'redis', '--version', '99')
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /Version 99 is not saved/)

    assert.equal((await cli('--url', hosted.url)).status, 1)
    assert.equal((await cli('--query', 'redis')).status, 1)
  } finally {
    await registry.close()
    if (previousHome === undefined) delete process.env.LIVE_PLAN_HOME
    else process.env.LIVE_PLAN_HOME = previousHome
    await rm(home, { recursive: true, force: true })
  }
})

test('the hosted plan searches live by default and saved versions for the owner and the agent', async () => {
  const db = new Database(':memory:')
  const store = d1Of(db)
  const sql = sqlOf(db)
  const planId = 'plan-search-1234'
  const first = await readFile(examplePath, 'utf8')
  const now = first.replace('Fail open', 'Stay available')
  initPlan(sql, { token: 'plan-token', title: 'Rate limiting rollout', mode: 'watch', tier: 'pro', source: now })
  rememberPlanId(sql, planId)
  await publishPlanVersion(store, { planId, userId: 'user-1', title: 'Rate limiting rollout', source: first, now: 1 })
  await publishPlanVersion(store, { planId, userId: 'user-1', title: 'Rate limiting rollout', source: now, now: 2 })

  const call = (params: Record<string, string>, who: { actor?: string; bearer?: string }) =>
    hostedSearch({
      sql,
      db: store,
      actor: who.actor ?? null,
      authorization: who.bearer ? `Bearer ${who.bearer}` : null,
      url: new URL(`https://plan.internal/api/search?${new URLSearchParams(params)}`),
    })
  const agent = { bearer: 'plan-token' }

  const live = await call({ q: '"fail open"' }, agent)
  assert.equal(live.status, 200)
  const liveBody = (await live.json()) as { planId: string; versions: Array<{ seq: unknown; hits: unknown[] }> }
  assert.equal(liveBody.planId, planId)
  assert.deepEqual(liveBody.versions.map((version) => version.seq), ['live'])
  assert.equal(liveBody.versions[0]?.hits.length, 0)

  const all = (await (await call({ q: '"fail open"', version: 'all' }, agent)).json()) as {
    versions: Array<{ seq: unknown; hits: Array<{ blockId?: string }> }>
  }
  // Version 2 is the live source, so it is folded into the live result.
  assert.deepEqual(all.versions.map((version) => version.seq), ['live', 1])
  assert.equal(all.versions[1]?.hits[0]?.blockId, 'fail-mode')

  assert.equal((await call({ q: 'redis', version: '1' }, { actor: 'account' })).status, 200)
  assert.equal((await call({ q: 'redis' }, { actor: 'viewer' })).status, 200)
  assert.equal((await call({ q: 'redis', version: '1' }, { actor: 'viewer' })).status, 403)
  assert.equal((await call({ q: 'redis' }, {})).status, 401)
  assert.equal((await call({ q: 'redis' }, { bearer: 'wrong-token' })).status, 401)
  const gone = await call({ q: 'redis', version: '9' }, agent)
  assert.equal(gone.status, 404)
  assert.match(await gone.text(), /latest 10/)
  assert.equal((await call({ q: '' }, agent)).status, 400)
})

test('search access: the agent and the owner read versions, a viewer reads the live plan', () => {
  assert.equal(allows('plan', 'search'), true)
  assert.equal(allows('viewer', 'search'), true)
  assert.equal(allows(null, 'search'), false)
  assert.equal(allows('plan', 'versions'), true)
  assert.equal(allows('account', 'versions'), true)
  assert.equal(allows('viewer', 'versions'), false)
})

function d1Of(db: Database): D1Database {
  return {
    prepare(query: string) {
      const run = (...values: unknown[]) => {
        const statement = db.query(query)
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

test('a dashboard search reads live text by default and ranks plans by matched terms', () => {
  const doc = (seq: number, source: string) => ({ seq, title: `Plan v${seq}`, source, createdAt: seq })
  const plans = [
    { planId: 'aaaa1111', title: 'A', url: '/plans/aaaa1111/', documents: [doc(1, '# A\n\nRedis was here.\n'), doc(2, '# A\n\nNothing now.\n')] },
    { planId: 'bbbb2222', title: 'B', url: null, versionUrl: (seq: number) => `/plans/bbbb2222/versions/${seq}`, documents: [doc(3, '# B\n\nRedis and limits.\n')] },
    { planId: 'cccc3333', title: 'C', url: '/plans/cccc3333/', documents: [doc(1, '# C\n\nRedis only.\n')] },
  ]
  const base = { query: 'redis limits', terms: ['redis', 'limits'], match: 'any' as const, plans }
  const live = searchPlans({ ...base, version: 'live' })
  // A's live text has no match. Only its saved version 1 does, and that is not read by default.
  assert.deepEqual(live.plans.map((plan) => plan.planId), ['bbbb2222', 'cccc3333'])
  assert.equal(live.searchedPlans, 3)
  // A finished plan's live hit opens its saved version page.
  assert.equal(live.plans[0]?.versions[0]?.url, '/plans/bbbb2222/versions/3')
  assert.equal(live.plans[0]?.versions[0]?.live, true)

  const all = searchPlans({ ...base, version: 'all' })
  assert.deepEqual(all.plans.map((plan) => plan.planId), ['bbbb2222', 'aaaa1111', 'cccc3333'])
  const saved = all.plans[1]?.versions[0]
  assert.equal(saved?.seq, 1)
  assert.equal(saved?.live, false)
  assert.equal(saved?.url, null)

  assert.throws(() => dashboardSearchParams(new URL('https://x/api/dashboard/search?q=redis&version=2')), /version=live or version=all/)
  assert.equal(dashboardSearchParams(new URL('https://x/api/dashboard/search?q=redis')).version, 'live')
})

test('a dashboard search stops at 100 plans and 200 hits', () => {
  const many = Array.from({ length: DASHBOARD_PLAN_LIMIT + 5 }, (_, n) => ({
    planId: `plan${String(n).padStart(4, '0')}`,
    title: `P${n}`,
    url: null,
    documents: [{ seq: 1, title: `P${n}`, source: `# P${n}\n\n## a\nredis\n\n## b\nredis\n\n## c\nredis\n`, createdAt: 1 }],
  }))
  const result = searchPlans({ query: 'redis', terms: ['redis'], match: 'all', version: 'live', plans: many })
  assert.equal(result.searchedPlans, DASHBOARD_PLAN_LIMIT)
  assert.equal(result.truncated, true)
  assert.equal(
    result.plans.reduce((sum, plan) => sum + plan.versions.reduce((count, version) => count + version.hits.length, 0), 0),
    SEARCH_HIT_LIMIT,
  )
})

test('the local dashboard searches listed plans and leaves deleted ones out', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-dash-search-'))
  const previousHome = process.env.LIVE_PLAN_HOME
  process.env.LIVE_PLAN_HOME = home
  const first = join(home, 'rate.plan.md')
  const second = join(home, 'tables.plan.md')
  await copyFile(examplePath, first)
  await copyFile(resolve('examples/tables.plan.md'), second)
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  const search = (params: Record<string, string>) => fetch(new URL(`/api/dashboard/search?${new URLSearchParams(params)}`, registry.url))
  try {
    const rate = await registerHostedPlan(registry.url, registry.token, { planPath: first, mode: 'watch', cwd: home })
    const tables = await registerHostedPlan(registry.url, registry.token, { planPath: second, mode: 'watch', cwd: home })

    const found = (await (await search({ q: 'redis' })).json()) as {
      version: string
      searchedPlans: number
      plans: Array<{ planId: string; url: string | null; versions: Array<{ live: boolean; url: string | null; hits: Array<{ blockId?: string }> }> }>
    }
    assert.equal(found.version, 'live')
    assert.equal(found.searchedPlans, 2)
    assert.deepEqual(found.plans.map((plan) => plan.planId), [rate.id])
    assert.equal(found.plans[0]?.url, rate.url)
    assert.equal(found.plans[0]?.versions[0]?.live, true)
    assert.ok(found.plans[0]?.versions[0]?.hits.some((hit) => hit.blockId === 'fail-mode'))

    // An edit makes a second saved version. The old text is found only with version=all.
    const original = await readFile(first, 'utf8')
    await writeFile(first, original.replaceAll('Fail open', 'Stay available'))
    await waitFor(async () => {
      const next = (await (await search({ q: '"stay available"' })).json()) as { plans: unknown[] }
      return next.plans.length > 0
    })
    assert.equal(((await (await search({ q: '"fail open"' })).json()) as { plans: unknown[] }).plans.length, 0)
    const all = (await (await search({ q: '"fail open"', version: 'all' })).json()) as {
      plans: Array<{ versions: Array<{ live: boolean; seq: number }> }>
    }
    assert.equal(all.plans[0]?.versions[0]?.live, false)
    assert.equal(all.plans[0]?.versions[0]?.seq, 1)

    assert.equal((await search({ q: 'redis', version: '1' })).status, 400)
    assert.equal((await search({ q: '' })).status, 400)

    const deleted = await fetch(new URL(`/api/dashboard/plans/${rate.id}`, registry.url), { method: 'DELETE' })
    assert.equal(deleted.status, 200)
    const after = (await (await search({ q: 'redis' })).json()) as { searchedPlans: number; plans: unknown[] }
    assert.equal(after.plans.length, 0)
    assert.equal(after.searchedPlans, 1)
    assert.ok(tables.id)
  } finally {
    await registry.close()
    if (previousHome === undefined) delete process.env.LIVE_PLAN_HOME
    else process.env.LIVE_PLAN_HOME = previousHome
    await rm(home, { recursive: true, force: true })
  }
})

test('the hosted dashboard searches only this account\'s listed plans', async () => {
  const db = new Database(':memory:')
  const store = d1Of(db)
  db.run(`CREATE TABLE plans (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, ended_at INTEGER, started_at INTEGER, meta TEXT)`)
  db.run(`INSERT INTO plans VALUES ('mine-running', 'user-1', 'Running', NULL, 3, NULL)`)
  db.run(`INSERT INTO plans VALUES ('mine-finished', 'user-1', 'Finished', 5, 2, NULL)`)
  db.run(`INSERT INTO plans VALUES ('mine-deleted', 'user-1', 'Deleted', NULL, 1, '{"deletedAt": 9}')`)
  db.run(`INSERT INTO plans VALUES ('theirs-1234', 'user-2', 'Theirs', NULL, 4, NULL)`)
  const source = await readFile(examplePath, 'utf8')
  for (const planId of ['mine-running', 'mine-finished', 'mine-deleted', 'theirs-1234']) {
    await publishPlanVersion(store, { planId, userId: 'x', title: planId, source, now: 1 })
  }
  await publishPlanVersion(store, { planId: 'mine-running', userId: 'x', title: 'mine-running', source: source.replaceAll('Fail open', 'Stay available'), now: 2 })

  const call = async (params: Record<string, string>) =>
    accountSearch(store, 'user-1', new URL(`https://plans.example/api/account/search?${new URLSearchParams(params)}`))
  const live = (await (await call({ q: '"fail open"' })).json()) as {
    searchedPlans: number
    plans: Array<{ planId: string; versions: Array<{ url: string | null; seq: number; live: boolean }> }>
  }
  assert.equal(live.searchedPlans, 2)
  assert.deepEqual(live.plans.map((plan) => plan.planId), ['mine-finished'])
  assert.equal(live.plans[0]?.versions[0]?.url, '/plans/mine-finished/versions/1')

  const all = (await (await call({ q: '"fail open"', version: 'all' })).json()) as typeof live
  assert.deepEqual(all.plans.map((plan) => plan.planId).sort(), ['mine-finished', 'mine-running'])
  const older = all.plans.find((plan) => plan.planId === 'mine-running')?.versions[0]
  assert.equal(older?.live, false)
  assert.equal(older?.url, '/plans/mine-running/versions/1')

  const runningLive = (await (await call({ q: '"stay available"' })).json()) as typeof live
  assert.equal(runningLive.plans[0]?.versions[0]?.url, '/plans/mine-running/')
  assert.equal((await call({ q: 'redis', version: '3' })).status, 400)
})

test('live-plan search without --url searches every plan on this machine', { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-search-all-'))
  const previousHome = process.env.LIVE_PLAN_HOME
  process.env.LIVE_PLAN_HOME = home
  const first = join(home, 'rate.plan.md')
  const second = join(home, 'tables.plan.md')
  await copyFile(examplePath, first)
  await copyFile(resolve('examples/tables.plan.md'), second)
  const { version } = JSON.parse(await readFile(resolve('package.json'), 'utf8')) as { version: string }
  // Same version as the CLI, so the CLI uses this service instead of starting another one.
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value', version })
  const cli = (...args: string[]) => runCli(home, ['search', ...args])
  try {
    const rate = await registerHostedPlan(registry.url, registry.token, { planPath: first, mode: 'watch', cwd: home })
    await registerHostedPlan(registry.url, registry.token, { planPath: second, mode: 'watch', cwd: home })

    const found = await cli('--query', 'redis', '-q', '"fail open"')
    assert.equal(found.status, 0, found.stderr)
    assert.match(found.stdout, new RegExp(`^Rate limiting rollout {2}${rate.url.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`, 'm'))
    assert.match(found.stdout, /^ {2}live$/m)
    assert.match(found.stdout, /^ {4}choice {2}fail-mode {2}L95 /m)
    assert.match(found.stdout, /1 match in 1 plan, live text only\./)

    const json = await cli('--query', 'redis', '--version', 'all', '--json')
    assert.equal(json.status, 0, json.stderr)
    const parsed = JSON.parse(json.stdout) as { version: string; searchedPlans: number; plans: Array<{ planId: string }> }
    assert.equal(parsed.version, 'all')
    assert.equal(parsed.searchedPlans, 2)
    assert.deepEqual(parsed.plans.map((plan) => plan.planId), [rate.id])

    const none = await cli('--query', 'kubernetes')
    assert.equal(none.status, 2)
    assert.match(none.stdout, /No matches in 2 plans, live text only\./)

    const numbered = await cli('--query', 'redis', '--version', '1')
    assert.equal(numbered.status, 1)
    assert.match(numbered.stderr, /applies to one plan/)
    assert.equal((await cli('--query', 'redis', '--cloud', '--url', rate.url)).status, 1)
  } finally {
    await registry.close()
    if (previousHome === undefined) delete process.env.LIVE_PLAN_HOME
    else process.env.LIVE_PLAN_HOME = previousHome
    await rm(home, { recursive: true, force: true })
  }
})

test('live-plan search --cloud searches every plan on the signed-in account', { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-search-cloud-'))
  const seen: Array<{ path: string; auth: string | null; params: Record<string, string> }> = []
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      seen.push({ path: url.pathname, auth: request.headers.get('authorization'), params: Object.fromEntries(url.searchParams) })
      if (request.headers.get('authorization') !== 'Bearer account-token') return new Response('Sign in required', { status: 401 })
      return Response.json({
        query: url.searchParams.get('q'),
        terms: ['redis'],
        match: 'all',
        version: url.searchParams.get('version') ?? 'live',
        truncated: false,
        searchedPlans: 2,
        plans: [
          {
            planId: 'plan-one-1234',
            title: 'Rate limiting rollout',
            url: '/plans/plan-one-1234/',
            versions: [
              { seq: 4, title: 'Rate limiting rollout', createdAt: 1, live: true, parsed: true, url: '/plans/plan-one-1234/', hits: [{ blockId: 'fail-mode', type: 'choice', line: 95, snippet: 'If Redis is unreachable', matched: ['redis'] }] },
              { seq: 2, title: 'Rate limiting rollout', createdAt: 1, live: false, parsed: true, url: '/plans/plan-one-1234/versions/2', hits: [{ blockId: 'design', type: 'phase', line: 44, snippet: 'Use Redis', matched: ['redis'] }] },
            ],
          },
        ],
      })
    },
  })
  const base = `http://127.0.0.1:${server.port}`
  try {
    const signedOut = await runCli(home, ['search', '--query', 'redis', '--cloud'])
    assert.equal(signedOut.status, 1)
    assert.match(signedOut.stderr, /account login/)

    await writeFile(join(home, 'cloud.json'), JSON.stringify({ account: { baseUrl: base, token: 'account-token' }, plans: {} }))
    const found = await runCli(home, ['search', '--query', 'redis', '--version', 'all', '--any', '--cloud'])
    assert.equal(found.status, 0, found.stderr)
    assert.deepEqual(seen.at(-1), { path: '/api/account/search', auth: 'Bearer account-token', params: { q: 'redis', version: 'all', match: 'any' } })
    assert.match(found.stdout, new RegExp(`^Rate limiting rollout {2}${base}/plans/plan-one-1234/$`, 'm'))
    assert.match(found.stdout, new RegExp(`^ {2}v2 {2}${base}/plans/plan-one-1234/versions/2$`, 'm'))
    assert.match(found.stdout, /^ {4}phase {2}design {2}L44 {2}Use Redis$/m)

    const oldHost = Bun.serve({ port: 0, fetch: () => new Response('Not found', { status: 404 }) })
    await writeFile(join(home, 'cloud.json'), JSON.stringify({ account: { baseUrl: `http://127.0.0.1:${oldHost.port}`, token: 'account-token' }, plans: {} }))
    const missing = await runCli(home, ['search', '--query', 'redis', '--cloud'])
    oldHost.stop(true)
    assert.equal(missing.status, 1)
    assert.match(missing.stderr, /does not offer plan search yet/)

    await writeFile(join(home, 'cloud.json'), JSON.stringify({ account: { baseUrl: base, token: 'expired' }, plans: {} }))
    const expired = await runCli(home, ['search', '--query', 'redis', '--cloud'])
    assert.equal(expired.status, 1)
    assert.match(expired.stderr, /Sign in required/)
  } finally {
    server.stop(true)
    await rm(home, { recursive: true, force: true })
  }
})
