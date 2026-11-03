import {
  catalogFromOwned,
  dashboardFetchDue,
  plansToWarm,
  type CatalogRow,
  type PlanSnapshot,
  type WarmPlan,
} from '../../src/offlineSync.ts'
import { documentCacheRequest, SHELL_CACHE_NAME, shouldStoreDocument } from '../../src/shellCache.ts'
import type { OfflineHandle } from './engine.ts'

const PERIODS = ['day', 'week', 'month'] as const

type RefreshResult =
  | { body: unknown; savedAt: number; offline: boolean }
  | { missing: true }

type AccountPlans = { plans?: Array<{ id?: unknown; title?: unknown; mode?: unknown }> }

type DashboardPlans = { plans?: Array<Record<string, unknown>> }

let warming = false

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

/**
 * Any hosted page: refresh the account's plan list and save the plans that are due.
 * `forceAccount` re-reads the list even when the stored copy is recent, so a plan
 * created elsewhere is saved the next time this tab becomes active.
 */
export async function syncOwnedPlans(engine: OfflineHandle | null, options: { forceAccount?: boolean } = {}): Promise<void> {
  if (!engine?.available || !warmingAllowed()) return
  try {
    await refreshAccount(engine, options.forceAccount === true)
    syncOwnedCatalog(engine)
    engine.noteNetwork(true)
    await warmOwnedPlans(engine)
  } catch {
    engine.noteNetwork(false)
  }
}

export async function warmOwnedPlans(engine: OfflineHandle): Promise<void> {
  if (!engine.available || !warmingAllowed() || warming) return
  const due = plansToWarm(warmPlans(engine.catalog()), engine.catalog(), Date.now(), undefined, SHELL_CACHE_NAME)
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
    if (!snapshotResponse.ok) {
      engine.markWarmFailed(id, Date.now(), SHELL_CACHE_NAME)
      return
    }
    engine.storePlanSnapshot(id, basePath, (await snapshotResponse.json()) as PlanSnapshot)
    const stored = await storePlanDocument(basePath)
    if (stored === 'stored') {
      engine.markWarmed(id, row?.versionKey ?? '', Date.now(), SHELL_CACHE_NAME)
      return
    }
    if (stored === 'rejected') engine.markWarmFailed(id, Date.now(), SHELL_CACHE_NAME)
  } catch {
    // Network failure: the next online dashboard refresh tries this plan again.
  }
}

/**
 * The page writes the document. On the first visit the worker does not control
 * the page yet, so a fetch it does not see never lands in the cache.
 */
async function storePlanDocument(basePath: string): Promise<'stored' | 'rejected' | 'unavailable'> {
  const absolute = new URL(basePath, location.origin).href
  const page = await fetch(absolute, { credentials: 'include', headers: { accept: 'text/html' } })
  if (!page.ok || !shouldStoreDocument(page)) return 'rejected'
  const ready = navigator.serviceWorker?.ready
  if (!ready || typeof caches === 'undefined') return 'unavailable'
  await ready
  const cache = await caches.open(SHELL_CACHE_NAME)
  await cache.put(documentCacheRequest(new Request(absolute)), page)
  return 'stored'
}

function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    const idle = window.requestIdleCallback
    if (typeof idle === 'function') idle(() => resolve(), { timeout: 2000 })
    else window.setTimeout(resolve, 200)
  })
}
