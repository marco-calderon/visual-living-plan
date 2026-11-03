import {
  catalogFromOwned,
  dashboardFetchDue,
  plansToWarm,
  type CatalogRow,
  type PlanSnapshot,
  type WarmPlan,
} from '../../src/offlineSync.ts'
import type { OfflineHandle } from './engine.ts'

const PERIODS = ['day', 'week', 'month'] as const

type RefreshResult =
  | { body: unknown; savedAt: number; offline: boolean }
  | { missing: true }

type AccountPlans = { plans?: Array<{ id?: unknown; title?: unknown; mode?: unknown }> }

type DashboardPlans = { plans?: Array<Record<string, unknown>> }

let warming = false
let settingsWarmedAt = 0

const SETTINGS_WARM_INTERVAL_MS = 10 * 60 * 1000

export function warmingAllowed(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (connection?.saveData) return false
  if (typeof window !== 'undefined' && window.isSecureContext === false) return false
  return true
}

export async function refreshDeviceDashboards(
  engine: OfflineHandle | null,
  options: { period: string; force?: boolean },
): Promise<RefreshResult> {
  if (!engine?.available) return fetchWithoutDevice(options.period)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    engine.noteNetwork(false)
    return storedPeriod(engine, options.period)
  }
  try {
    await refreshAccount(engine, false)
    void warmSettingsPage(engine)
    const savedAt = Date.now()
    const body = await fetchPeriod(engine, options.period, options.force === true)
    syncOwnedCatalog(engine)
    void warmOwnedPlans(engine)
    void refreshOtherPeriods(engine, options.period)
    engine.noteNetwork(true)
    return { body, savedAt, offline: false }
  } catch {
    engine.noteNetwork(false)
    return storedPeriod(engine, options.period)
  }
}

export async function warmOwnedPlans(engine: OfflineHandle): Promise<void> {
  if (!engine.available || !warmingAllowed() || warming) return
  const due = plansToWarm(warmPlans(engine.catalog()), engine.catalog(), Date.now())
  if (due.length === 0) return
  warming = true
  try {
    let index = 0
    async function worker(): Promise<void> {
      for (;;) {
        const id = due[index]
        index += 1
        if (!id) return
        await whenIdle()
        if (!warmingAllowed()) return
        await warmOne(engine, id)
      }
    }
    await Promise.all([worker(), worker()])
  } finally {
    warming = false
  }
}

/**
 * Fetch the settings page while online, so the shell worker keeps a copy and the page opens offline.
 * Only for a signed-in account, and at most once every 10 minutes.
 */
export async function warmSettingsPage(engine: OfflineHandle | null, now = Date.now()): Promise<void> {
  if (!engine?.available || !engine.account() || !warmingAllowed()) return
  if (settingsWarmedAt && now - settingsWarmedAt < SETTINGS_WARM_INTERVAL_MS) return
  settingsWarmedAt = now
  try {
    const page = await fetch('/settings', { credentials: 'include', headers: { accept: 'text/html' } })
    await page.text()
  } catch {
    settingsWarmedAt = 0
  }
}

async function refreshAccount(engine: OfflineHandle, force: boolean): Promise<void> {
  const current = engine.account()
  if (!force && current && !dashboardFetchDue(current.savedAt, Date.now())) return
  const response = await fetch('/api/account', { cache: 'no-store', credentials: 'include' })
  if (response.status === 401) return
  if (!response.ok) throw new Error('Request failed')
  engine.rememberAccount(await response.json())
}

async function fetchPeriod(engine: OfflineHandle, period: string, force: boolean): Promise<unknown> {
  const saved = engine.dashboard(period)
  if (!force && saved && !dashboardFetchDue(saved.savedAt, Date.now())) return saved.payload
  const response = await fetch(`/api/account/dashboard?period=${encodeURIComponent(period)}`, {
    cache: 'no-store',
    credentials: 'include',
  })
  if (!response.ok) throw new Error('Request failed')
  const body: unknown = await response.json()
  engine.rememberDashboard(period, body)
  return body
}

async function refreshOtherPeriods(engine: OfflineHandle, current: string): Promise<void> {
  for (const period of PERIODS) {
    if (period === current) continue
    try {
      await fetchPeriod(engine, period, false)
    } catch {
      // The visible period already rendered. The other tabs keep their last copy.
    }
  }
  syncOwnedCatalog(engine)
  void warmOwnedPlans(engine)
}

function syncOwnedCatalog(engine: OfflineHandle): void {
  const account = engine.account()?.payload as AccountPlans | undefined
  if (!account || !Array.isArray(account.plans)) return
  const plans = account.plans
  const dashboardPlans = PERIODS.flatMap((period) => {
    const body = engine.dashboard(period)?.payload as DashboardPlans | undefined
    return Array.isArray(body?.plans) ? body.plans : []
  })
  engine.rememberCatalog(catalogFromOwned(plans, dashboardPlans, engine.catalog()))
}

async function fetchWithoutDevice(period: string): Promise<RefreshResult> {
  try {
    const response = await fetch(`/api/account/dashboard?period=${encodeURIComponent(period)}`, {
      cache: 'no-store',
      credentials: 'include',
    })
    if (!response.ok) return { missing: true }
    return { body: await response.json(), savedAt: Date.now(), offline: false }
  } catch {
    return { missing: true }
  }
}

function storedPeriod(engine: OfflineHandle | null, period: string): RefreshResult {
  const saved = engine?.dashboard(period)
  if (!saved) return { missing: true }
  return { body: saved.payload, savedAt: saved.savedAt, offline: true }
}

function warmPlans(rows: readonly CatalogRow[]): WarmPlan[] {
  return rows.map((row) => ({
    id: row.id,
    versionKey: row.versionKey ?? '',
    recency: row.recency ?? 0,
  }))
}

async function warmOne(engine: OfflineHandle, id: string): Promise<void> {
  const row = engine.catalog().find((entry) => entry.id === id)
  const basePath = `/plans/${id}`
  try {
    const snapshotResponse = await fetch(`${basePath}/api/snapshot`, { cache: 'no-store', credentials: 'include' })
    if (snapshotResponse.ok) {
      engine.storePlanSnapshot(id, basePath, (await snapshotResponse.json()) as PlanSnapshot)
      const page = await fetch(basePath, { credentials: 'include', headers: { accept: 'text/html' } })
      await page.text()
    }
    // Any answer from the host counts as an attempt, so a failing plan waits WARM_INTERVAL_MS
    // instead of being fetched again on every 4 s dashboard poll.
    engine.markWarmed(id, row?.versionKey ?? '', Date.now())
  } catch {
    // Network failure: the next online dashboard refresh tries this plan again.
  }
}

function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    const idle = window.requestIdleCallback
    if (typeof idle === 'function') idle(() => resolve(), { timeout: 2000 })
    else window.setTimeout(resolve, 200)
  })
}
