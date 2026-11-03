import {
  offlineStatusText,
  type AccountRow,
  type CatalogRow,
  type CommentRow,
  type DashboardStoreRow,
  type PlanRow,
  type PlanSnapshot,
  type SettingsRow,
  type UserMutationKind,
} from '../../src/offlineSync.ts'

export type PlanPostResult = {
  ok: boolean
  status: number
  body: unknown
  text: string
  queued?: boolean
}

export type OfflineHandle = {
  available: boolean
  hydrated: boolean
  plan: (id: string) => PlanRow | undefined
  comments: (planId: string) => CommentRow[]
  catalog: () => CatalogRow[]
  subscribe: (listener: () => void) => () => void
  syncPlan: () => Promise<void>
  noteLive: (event: string, data: unknown) => void
  submit: (input: { kind: UserMutationKind; path: string; body: unknown }) => Promise<PlanPostResult>
  rememberCatalog: (plans: CatalogRow[]) => void
  account: () => AccountRow | null
  rememberAccount: (payload: unknown) => void
  dashboard: (period: string) => DashboardStoreRow | null
  rememberDashboard: (period: string, payload: unknown) => void
  storePlanSnapshot: (id: string, basePath: string, snapshot: PlanSnapshot) => void
  markWarmed: (id: string, versionKey: string, warmedAt: number, cacheName: string) => void
  markWarmFailed: (id: string, failedAt: number, cacheName: string) => void
  pendingCount: () => number
  noteNetwork: (online: boolean) => void
  clearDevice: (options?: { force?: boolean }) => Promise<boolean>
  saveSettings: (scope: string, patch: Partial<SettingsRow> & { url: string }) => Promise<void>
}

type OfflineWindow = Window & {
  __livingPlanOfflinePromise?: Promise<OfflineHandle | null>
  __livingPlanOffline?: OfflineHandle | { available: false }
  __LIVE_PLAN_BASE__?: string
  __LIVE_PLAN_HOST__?: string
}

export function planContext(): { id: string; host: 'local' | 'cloud'; basePath: string } {
  const win = window as OfflineWindow
  const basePath = win.__LIVE_PLAN_BASE__ ?? ''
  const match = basePath.match(/\/plans\/([A-Za-z0-9_-]{8,80})/) ?? location.pathname.match(/\/plans\/([A-Za-z0-9_-]{8,80})/)
  return {
    id: match?.[1] ?? 'local',
    host: win.__LIVE_PLAN_HOST__ === 'cloud' ? 'cloud' : 'local',
    basePath,
  }
}

export function startOfflineEngine(): Promise<OfflineHandle | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  const win = window as OfflineWindow
  if (!win.__livingPlanOfflinePromise) win.__livingPlanOfflinePromise = boot(win)
  return win.__livingPlanOfflinePromise
}

export async function postPlanMutation(kind: UserMutationKind, path: string, body: unknown): Promise<PlanPostResult> {
  const engine = await startOfflineEngine()
  if (engine?.available) return engine.submit({ kind, path, body })
  return postDirect(path, body)
}

export function currentOfflineHandle(): OfflineHandle | null {
  if (typeof window === 'undefined') return null
  const handle = (window as OfflineWindow).__livingPlanOffline
  if (handle && 'plan' in handle && handle.available) return handle
  return null
}

export function paintOfflineStatus(handle: OfflineHandle | null, pending: number, failed: number, offline: boolean): void {
  const text = offlineStatusText({
    available: Boolean(handle?.available),
    offline,
    pending,
    failed,
  })
  for (const node of document.querySelectorAll('[data-offline-state]')) {
    if (!(node instanceof HTMLElement)) continue
    if (!text) {
      node.hidden = true
      node.textContent = ''
      continue
    }
    node.hidden = false
    node.textContent = text
  }
}

async function boot(win: OfflineWindow): Promise<OfflineHandle | null> {
  if (!window.isSecureContext) {
    win.__livingPlanOffline = { available: false }
    return null
  }
  try {
    const store = await import('./browserStore.ts')
    const handle = await store.openBrowserStore()
    win.__livingPlanOffline = handle
    return handle
  } catch {
    win.__livingPlanOffline = { available: false }
    return null
  }
}

async function postDirect(path: string, body: unknown): Promise<PlanPostResult> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const text = await response.text()
  return { ok: response.ok, status: response.status, body: parseJson(text), text }
}

function parseJson(text: string): unknown {
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}
