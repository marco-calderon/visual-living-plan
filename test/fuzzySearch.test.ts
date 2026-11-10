import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { Database } from 'bun:sqlite'
import { accountSearch } from '../src/host/accountSearch.ts'
import { publishPlanVersion } from '../src/host/planVersions.ts'
import { renderDashboardPage } from '../src/dashboardPage.ts'
import { emptyPlansText } from '../src/dashboardFormat.ts'
import { formatDashboardSearch, highlightParts, searchSummary, throttle } from '../src/dashboardSearchView.ts'
import {
  dashboardSearchParams,
  parseSearchFuzzy,
  SearchRequestError,
  searchParams,
  searchPlanSource,
  searchPlans,
  type DashboardSearchResponse,
} from '../src/planSearch.ts'
import { createMatcher, editDistance, scoreWord } from '../src/searchMatch.ts'
import { registerHostedPlan } from '../src/registryClient.ts'
import { startRegistryServer } from '../src/registryService.ts'

const examplePath = resolve('examples/rate-limit.plan.md')

test('edit distance counts a swap of neighbours as one typo and stops past the limit', () => {
  assert.equal(editDistance('redis', 'redis', 1), 0)
  assert.equal(editDistance('reids', 'redis', 1), 1)
  assert.equal(editDistance('redis', 'reds', 1), 1)
  assert.equal(editDistance('limiter', 'limit', 1), 2)
  assert.equal(editDistance('dashboard', 'dashbord', 2), 1)
})

test('a word matches exactly, as a word start, or within its typo budget', () => {
  assert.equal(scoreWord('redis', 'redis'), 1)
  assert.equal(scoreWord('limit', 'limiting'), 0.9)
  assert.ok(scoreWord('reids', 'redis') > 0)
  // A partly typed word with a typo still finds the longer word.
  assert.ok(scoreWord('limt', 'limiting') > 0)
  // Three letters or fewer allow no typo.
  assert.equal(scoreWord('rdi', 'redis'), 0)
  // The first letter has to match.
  assert.equal(scoreWord('xedis', 'redis'), 0)
  assert.ok(scoreWord('redis', 'redis') > scoreWord('reids', 'redis'))
})

test('exact matching stays a substring test, fuzzy matching ranks exact words first', () => {
  const exact = createMatcher(false)
  assert.equal(exact.score('Use Redis here', 'redis'), 1)
  assert.equal(exact.score('Use Redis here', 'reids'), 0)
  const fuzzy = createMatcher(true)
  assert.equal(fuzzy.score('Use Redis here', 'redis'), 1)
  assert.ok(fuzzy.score('Use Redis here', 'reids') > 0)
  assert.ok(fuzzy.score('Use Redis here', 'reids') < fuzzy.score('Use Redis here', 'redis'))
  assert.ok(fuzzy.score('# Rate limiting rollout', 'ratelimit') > 0)
  assert.deepEqual(fuzzy.ranges('Use Redis, not reids', ['redis']), [[4, 9], [15, 20]])
})

test('the fuzzy parameter is off unless asked for', () => {
  assert.equal(parseSearchFuzzy(undefined), false)
  assert.equal(parseSearchFuzzy('off'), false)
  assert.equal(parseSearchFuzzy('on'), true)
  assert.equal(parseSearchFuzzy('true'), true)
  assert.throws(() => parseSearchFuzzy('maybe'), SearchRequestError)
  assert.equal(searchParams(new URL('https://x/api/search?q=redis')).fuzzy, false)
  assert.equal(dashboardSearchParams(new URL('https://x/api/dashboard/search?q=redis&fuzzy=on')).fuzzy, true)
})

test('a fuzzy search finds typos, carries highlight ranges, and ranks the exact phrase first', async () => {
  const source = await readFile(examplePath, 'utf8')
  assert.equal(searchPlanSource(source, ['reids']).hits.length, 0)
  const typo = searchPlanSource(source, ['reids'], 'all', { fuzzy: true })
  assert.ok(typo.hits.some((hit) => hit.blockId === 'design'))
  for (const hit of typo.hits) {
    assert.ok(hit.ranges && hit.ranges.length > 0, 'a fuzzy hit says what to highlight')
    const marked = hit.ranges.map(([start, end]) => hit.snippet.slice(start, end).toLowerCase())
    assert.ok(marked.some((text) => text.includes('redis')), `${hit.snippet} marks ${marked}`)
    assert.equal(typeof hit.score, 'number')
  }
  // "Fail open" is the exact phrase. "Fail-open" is found word by word and ranks after it.
  const phrase = searchPlanSource(source, ['fail open'], 'all', { fuzzy: true })
  assert.deepEqual(phrase.hits.map((hit) => hit.blockId), ['fail-mode', 'redis-dependency'])
  // Exact search leaves the score and ranges out.
  const exact = searchPlanSource(source, ['redis'])
  assert.equal(exact.hits[0]?.score, undefined)
  assert.equal(exact.hits[0]?.ranges, undefined)
  assert.equal(searchPlanSource(source, ['kubernetes'], 'all', { fuzzy: true }).hits.length, 0)
})

const doc = (seq: number, title: string, source: string) => ({ seq, title, source, createdAt: seq })

test('a dashboard search matches plan titles and lists a title-only match', () => {
  const plans = [
    { planId: 'aaaa1111', title: 'Notes', url: '/plans/aaaa1111/', documents: [doc(1, 'Notes', '# Notes\n\nRedis caching notes.\n')] },
    {
      planId: 'bbbb2222',
      title: 'Redis rollout',
      url: null,
      versionUrl: (seq: number) => `/plans/bbbb2222/versions/${seq}`,
      documents: [doc(2, 'Redis rollout', '# Rollout\n\nNothing about the store here.\n')],
    },
  ]
  const result = searchPlans({ query: 'redis', terms: ['redis'], match: 'all', version: 'live', plans })
  // The title match ranks first. It has no block hits, and opens its newest saved version.
  assert.deepEqual(result.plans.map((plan) => plan.planId), ['bbbb2222', 'aaaa1111'])
  assert.deepEqual(result.plans[0]?.titleMatched, ['redis'])
  assert.equal(result.plans[0]?.versions.length, 0)
  assert.equal(result.plans[0]?.openUrl, '/plans/bbbb2222/versions/2')
  assert.equal(result.plans[1]?.openUrl, '/plans/aaaa1111/')
  assert.deepEqual(result.plans[1]?.titleMatched, [])
  assert.match(searchSummary(result), /^2 matches in 2 plans/)
  assert.match(formatDashboardSearch(result), /^ {2}title {2}redis$/m)
})

test('terms in a plan title count toward every block of that plan', () => {
  const plans = [
    { planId: 'rate1234', title: 'Rate limiting rollout', url: '/plans/rate1234/', documents: [doc(1, 'Rate limiting rollout', '# Plan\n\n## Store\n\nUse Redis.\n\n## Other\n\nNothing.\n')] },
    { planId: 'other123', title: 'Cache', url: '/plans/other123/', documents: [doc(1, 'Cache', '# Cache\n\nRedis cache.\n')] },
  ]
  const result = searchPlans({ query: 'rate redis', terms: ['rate', 'redis'], match: 'all', version: 'live', plans })
  assert.deepEqual(result.plans.map((plan) => plan.planId), ['rate1234'])
  assert.deepEqual(result.plans[0]?.titleMatched, ['rate'])
  // The block that holds "redis" is a hit; the one with neither term is not.
  assert.deepEqual(result.plans[0]?.versions[0]?.hits.map((hit) => hit.title), ['Store'])
})

test('a fuzzy dashboard search marks the matched part of a title', () => {
  const plans = [{ planId: 'rate1234', title: 'Rate limiting rollout', url: '/plans/rate1234/', documents: [doc(1, 'Rate limiting rollout', '# Plan\n\nText.\n')] }]
  const result = searchPlans({ query: 'limitng', terms: ['limitng'], match: 'all', fuzzy: true, version: 'live', plans })
  assert.equal(result.fuzzy, true)
  const plan = result.plans[0]!
  assert.deepEqual(plan.titleRanges, [[5, 13]])
  assert.deepEqual(
    highlightParts(plan.title, plan.titleMatched ?? [], plan.titleRanges).filter((part) => part.match).map((part) => part.text),
    ['limiting'],
  )
})

test('highlighting uses the ranges a fuzzy result sends, and the terms otherwise', () => {
  assert.deepEqual(highlightParts('Use Redis now', ['nothing'], [[4, 9]]), [
    { text: 'Use ', match: false },
    { text: 'Redis', match: true },
    { text: ' now', match: false },
  ])
  assert.deepEqual(
    highlightParts('Use Redis now', ['redis']).filter((part) => part.match).map((part) => part.text),
    ['Redis'],
  )
})

test('the throttle runs the first call at once and the last call of a burst once', async () => {
  const seen: string[] = []
  const typed = throttle((value: string) => seen.push(value), 40)
  typed('r')
  typed('re')
  typed('red')
  assert.deepEqual(seen, ['r'])
  await new Promise((done) => setTimeout(done, 70))
  assert.deepEqual(seen, ['r', 'red'])
  // After a pause the next call runs at once again. Cancel drops the one waiting behind it.
  await new Promise((done) => setTimeout(done, 50))
  typed('a')
  typed('b')
  typed.cancel()
  await new Promise((done) => setTimeout(done, 70))
  assert.deepEqual(seen, ['r', 'red', 'a'])
  // Flush runs the waiting call now.
  typed('c')
  typed('d')
  typed.flush()
  assert.deepEqual(seen, ['r', 'red', 'a', 'c', 'd'])
})

test('the empty table line names the filter and the period', () => {
  assert.equal(emptyPlansText('all', 'day'), 'No plans today.')
  assert.equal(emptyPlansText('idle', 'week'), 'No idle plans this week.')
  assert.equal(emptyPlansText('interrupted', 'month'), 'No interrupted plans this month.')
})

test('the local dashboard page starts with skeletons and a search field that searches as you type', () => {
  const html = renderDashboardPage()
  assert.equal((html.match(/class="stat stat-skeleton"/g) ?? []).length, 7)
  assert.ok((html.match(/class="row-skeleton"/g) ?? []).length >= 3)
  assert.match(html, /id="status">Loading plans…</)
  assert.match(html, /id="search-box"/)
  assert.match(html, /fuzzy: 'on'/)
  assert.match(html, /const searchThrottleMs = 300/)
  assert.doesNotMatch(html, /id="search-submit"/)
})

test('the local dashboard endpoint searches fuzzily when asked', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-fuzzy-'))
  const previousHome = process.env.LIVE_PLAN_HOME
  process.env.LIVE_PLAN_HOME = home
  const planPath = join(home, 'rate.plan.md')
  await copyFile(examplePath, planPath)
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  const search = (params: Record<string, string>) => fetch(new URL(`/api/dashboard/search?${new URLSearchParams(params)}`, registry.url))
  try {
    const rate = await registerHostedPlan(registry.url, registry.token, { planPath, mode: 'watch', cwd: home })
    const exact = (await (await search({ q: 'reids' })).json()) as DashboardSearchResponse
    assert.equal(exact.fuzzy, false)
    assert.equal(exact.plans.length, 0)
    const fuzzy = (await (await search({ q: 'reids', fuzzy: 'on' })).json()) as DashboardSearchResponse
    assert.equal(fuzzy.fuzzy, true)
    assert.deepEqual(fuzzy.plans.map((plan) => plan.planId), [rate.id])
    const title = (await (await search({ q: 'rate limitng rollot', fuzzy: 'on' })).json()) as DashboardSearchResponse
    assert.deepEqual(title.plans[0]?.titleMatched, ['rate', 'limitng', 'rollot'])
    assert.equal((await search({ q: 'redis', fuzzy: 'sometimes' })).status, 400)
  } finally {
    await registry.close()
    if (previousHome === undefined) delete process.env.LIVE_PLAN_HOME
    else process.env.LIVE_PLAN_HOME = previousHome
    await rm(home, { recursive: true, force: true })
  }
})

test('live-plan search --fuzzy finds a typo the exact search misses', { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-fuzzy-cli-'))
  const previousHome = process.env.LIVE_PLAN_HOME
  process.env.LIVE_PLAN_HOME = home
  const registry = await startRegistryServer({ home, port: 0, token: 'test-token-value' })
  try {
    const hosted = await registerHostedPlan(registry.url, registry.token, { planPath: examplePath, mode: 'watch', cwd: process.cwd() })
    assert.equal((await runCli(home, ['search', '--url', hosted.url, '--query', 'reids'])).status, 2)
    const fuzzy = await runCli(home, ['search', '--url', hosted.url, '--query', 'reids', '--fuzzy', '--json'])
    assert.equal(fuzzy.status, 0, fuzzy.stderr)
    const parsed = JSON.parse(fuzzy.stdout) as { fuzzy: boolean; versions: Array<{ hits: Array<{ blockId?: string }> }> }
    assert.equal(parsed.fuzzy, true)
    assert.ok(parsed.versions[0]?.hits.some((hit) => hit.blockId === 'fail-mode'))
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

test('the hosted dashboard endpoint runs the fuzzy search on the Worker', async () => {
  const db = new Database(':memory:')
  const store = d1Of(db)
  db.run(`CREATE TABLE plans (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, ended_at INTEGER, started_at INTEGER, meta TEXT)`)
  db.run(`INSERT INTO plans VALUES ('mine-running', 'user-1', 'Rate limiting rollout', NULL, 3, NULL)`)
  db.run(`INSERT INTO plans VALUES ('theirs-1234', 'user-2', 'Rate limiting rollout', NULL, 4, NULL)`)
  const source = await readFile(examplePath, 'utf8')
  for (const planId of ['mine-running', 'theirs-1234']) {
    await publishPlanVersion(store, { planId, userId: 'x', title: 'Rate limiting rollout', source, now: 1 })
  }
  const call = async (params: Record<string, string>) =>
    (await (await accountSearch(store, 'user-1', new URL(`https://plans.example/api/account/search?${new URLSearchParams(params)}`))).json()) as DashboardSearchResponse
  assert.equal((await call({ q: 'dashbord' })).plans.length, 0)
  const fuzzy = await call({ q: 'dashbord', fuzzy: 'on' })
  assert.deepEqual(fuzzy.plans.map((plan) => plan.planId), ['mine-running'])
  assert.ok(fuzzy.plans[0]?.versions[0]?.hits.every((hit) => (hit.ranges?.length ?? 0) > 0))
  const title = await call({ q: 'ratelimit', fuzzy: 'on' })
  assert.deepEqual(title.plans[0]?.titleMatched, ['ratelimit'])
  assert.equal(title.plans[0]?.openUrl, '/plans/mine-running/')
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
