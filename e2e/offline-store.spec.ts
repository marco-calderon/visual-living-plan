import { expect, test } from '@playwright/test'
import { useOwnPlanServer } from './fixtures/ownServer.ts'

// Counts and checks the plan as it is on disk, so it does not share a server with other specs.
useOwnPlanServer(9482)

type OfflineWindow = Window & {
  __livingPlanOffline?: {
    available?: boolean
    plan?: (id: string) => { source?: string; responses?: Record<string, { optionId?: string }> } | undefined
    submit?: (input: { kind: string; path: string; body: unknown }) => Promise<unknown>
  }
}

test('an offline interaction is stored, restored, and recorded once', async ({ page, context }) => {
  await page.goto('/')
  const opfs = await page.evaluate(async () => {
    if (!navigator.storage?.getDirectory) return false
    try {
      await navigator.storage.getDirectory()
      return true
    } catch {
      return false
    }
  })
  test.skip(!opfs, 'Chromium has no OPFS')

  await page.waitForFunction(() => {
    const engine = (window as OfflineWindow).__livingPlanOffline
    return Boolean(engine?.available && engine.plan?.('local')?.source)
  })
  const source = await page.evaluate(() => (window as OfflineWindow).__livingPlanOffline?.plan?.('local')?.source ?? '')

  await page.reload()
  await page.waitForFunction(() => {
    const engine = (window as OfflineWindow).__livingPlanOffline
    return Boolean(engine?.available && engine.plan?.('local')?.source)
  })
  await expect.poll(() => page.evaluate(() => (window as OfflineWindow).__livingPlanOffline?.plan?.('local')?.source ?? '')).toBe(source)

  await context.route('**/api/interactions/**', (route) => route.abort())
  await page.evaluate(async () => {
    const engine = (window as OfflineWindow).__livingPlanOffline
    await engine?.submit?.({
      kind: 'interaction',
      path: '/api/interactions/fail-mode',
      body: { kind: 'choice', id: 'fail-mode', optionId: 'open', label: 'Fail open' },
    })
  })
  await page.reload()
  await page.waitForFunction(() => {
    const engine = (window as OfflineWindow).__livingPlanOffline
    return engine?.plan?.('local')?.responses?.['fail-mode']?.optionId === 'open'
  })

  await context.unroute('**/api/interactions/**')
  await expect.poll(async () => {
    const payload = await page.request.get('/api/plan')
    const body = (await payload.json()) as { responses?: Record<string, { optionId?: string }> }
    return body.responses?.['fail-mode']?.optionId ?? ''
  }, { timeout: 20_000 }).toBe('open')

  const interactions = await page.evaluate(async () => {
    return await new Promise<number>((resolve) => {
      const source = new EventSource('/api/agent-events')
      const timer = window.setTimeout(() => {
        source.close()
        resolve(-1)
      }, 5000)
      source.addEventListener('hello', (event) => {
        window.clearTimeout(timer)
        const data = JSON.parse((event as MessageEvent).data) as { pending?: Array<{ event?: string }> }
        source.close()
        resolve((data.pending ?? []).filter((item) => item.event === 'interaction').length)
      })
    })
  })
  expect(interactions).toBe(1)
})

type StoreWindow = Window & {
  __livingPlanOffline?: {
    available?: boolean
    hydrated?: boolean
    dashboard?: (period: string) => { payload?: unknown } | null
    rememberDashboard?: (period: string, payload: unknown) => void
  }
}

test('back-to-back device writes keep every row', async ({ page }) => {
  await page.goto('/')
  const opfs = await page.evaluate(async () => {
    if (!navigator.storage?.getDirectory) return false
    try {
      await navigator.storage.getDirectory()
      return true
    } catch {
      return false
    }
  })
  test.skip(!opfs, 'Chromium has no OPFS')

  await page.waitForFunction(() => Boolean((window as StoreWindow).__livingPlanOffline?.hydrated))
  // Each write lands only after the one before it is saved. A full snapshot built in between
  // used to erase the row that was still saving.
  await page.evaluate(() => {
    const engine = (window as StoreWindow).__livingPlanOffline
    for (const period of ['e2e-a', 'e2e-b', 'e2e-c', 'e2e-d']) engine?.rememberDashboard?.(period, { period })
  })
  const stored = () =>
    page.evaluate(() => {
      const engine = (window as StoreWindow).__livingPlanOffline
      return ['e2e-a', 'e2e-b', 'e2e-c', 'e2e-d'].filter((period) => engine?.dashboard?.(period)).join(',')
    })
  await expect.poll(stored).toBe('e2e-a,e2e-b,e2e-c,e2e-d')

  await page.reload()
  await page.waitForFunction(() => Boolean((window as StoreWindow).__livingPlanOffline?.hydrated))
  await expect.poll(stored).toBe('e2e-a,e2e-b,e2e-c,e2e-d')
})
