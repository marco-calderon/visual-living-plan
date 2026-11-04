import { createCollection, type Collection } from '@tanstack/db'
import {
  BrowserCollectionCoordinator,
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase,
  persistedCollectionOptions,
} from '@tanstack/browser-db-sqlite-persistence'
import { NonRetriableError, startOfflineExecutor, type OfflineExecutor } from '@tanstack/offline-transactions'
import {
  applyLiveToPlan,
  commentPartReady,
  commentRowsFromSnapshot,
  planRowFromSnapshot,
  plansToEvict,
  settingsWinner,
  accountWithSettings,
  type AccountRow,
  type CatalogRow,
  type CommentRow,
  type DashboardStoreRow,
  type PlanRow,
  type PlanSnapshot,
  type SettingsRow,
  type UserMutationKind,
  type VersionRow,
  versionRowId,
  versionRowsFromList,
} from '../../src/offlineSync.ts'
import { paintOfflineStatus, planContext, type OfflineHandle } from './engine.ts'
import { forgetCachedDocuments } from './forgetDocuments.ts'
import { viewingPlanVersion } from '../versionView.ts'

type SyncWrite = {
  begin: (options?: { snapshot?: boolean }) => void
  write: (message: { type: 'insert' | 'update'; value: object } | { type: 'delete'; key: string }) => void
  commit: () => unknown
  markReady: () => void
  fail: (error: unknown) => void
  reportError: (error: unknown) => void
  reportHealthy: () => void
}

// New collections are new ids at this same version. Bumping it resets every
// collection (TanStack's default mismatch policy) and would drop plan rows the
// outbox still points at. The outbox itself lives in IndexedDB, not this file.
const SCHEMA = 1

/**
 * One write to a device collection. `put` and `drop` touch only the rows they name, so two writes
 * close together cannot erase each other. A write only shows in `toArray` once the one before it
 * has been saved, so a full snapshot built from `toArray` could drop a row that was still saving.
 * `replace` is a full snapshot and is kept for clearing the device.
 */
type RowChange<T> = { put?: readonly T[]; drop?: readonly string[]; replace?: readonly T[] }

type RowWriter<T> = ((change: RowChange<T>) => void) | null

type QueuedMutation = {
  kind: UserMutationKind
  path: string
  body: unknown
  basePath: string
  planId: string
  /** Plan revision when the person acted. Missing on writes queued before this field existed. */
  baseRevision?: number
}

export async function openBrowserStore(): Promise<OfflineHandle> {
  const database = await openBrowserWASQLiteOPFSDatabase({ databaseName: 'living-plan.sqlite' })
  const coordinator = new BrowserCollectionCoordinator({ dbName: 'living-plan' })
  const persistence = createBrowserWASQLitePersistence({ database, coordinator })
  const listeners = new Set<() => void>()
  let failed = 0
  let reachable = navigator.onLine
  const results = new Map<string, unknown>()
  const writers: {
    plans: RowWriter<PlanRow>
    comments: RowWriter<CommentRow>
    catalog: RowWriter<CatalogRow>
    settings: RowWriter<SettingsRow>
    account: RowWriter<AccountRow>
    dashboards: RowWriter<DashboardStoreRow>
    versions: RowWriter<VersionRow>
  } = { plans: null, comments: null, catalog: null, settings: null, account: null, dashboards: null, versions: null }

  /**
   * `full` makes a put replace the whole row. `partial` merges it into the stored row when it is
   * applied, so a put can leave out a field another write owns.
   */
  function syncOptions<T extends object>(
    id: string,
    assign: (apply: (change: RowChange<T>) => void) => void,
    rowUpdateMode: 'full' | 'partial' = 'full',
  ) {
    return {
      id,
      getKey: (row: T & { id: string }) => row.id,
      persistence,
      schemaVersion: SCHEMA,
      initialRender: { strategy: 'network-first' as const, networkTimeoutMs: 0 },
      sync: {
        rowUpdateMode,
        sync: (params: SyncWrite) => {
          assign((change) => {
            if (change.replace) {
              params.begin({ snapshot: true })
              for (const row of change.replace) params.write({ type: 'insert', value: row })
            } else {
              params.begin()
            }
            // An update writes the row whether or not it is stored yet.
            for (const row of change.put ?? []) params.write({ type: 'update', value: row })
            for (const key of change.drop ?? []) params.write({ type: 'delete', key })
            params.commit()
          })
          params.markReady()
        },
      },
    }
  }

  const plans = createCollection(persistedCollectionOptions<PlanRow, string>(syncOptions<PlanRow>('plans', (apply) => { writers.plans = apply })))
  const comments = createCollection(persistedCollectionOptions<CommentRow, string>(syncOptions<CommentRow>('comments', (apply) => { writers.comments = apply })))
  const catalog = createCollection(persistedCollectionOptions<CatalogRow, string>(syncOptions<CatalogRow>('catalog', (apply) => { writers.catalog = apply }, 'partial')))
  const settings = createCollection(persistedCollectionOptions<SettingsRow, string>(syncOptions<SettingsRow>('settings', (apply) => { writers.settings = apply })))
  const account = createCollection(persistedCollectionOptions<AccountRow, string>(syncOptions<AccountRow>('account', (apply) => { writers.account = apply })))
  const dashboards = createCollection(persistedCollectionOptions<DashboardStoreRow, string>(syncOptions<DashboardStoreRow>('dashboards', (apply) => { writers.dashboards = apply })))
  const versions = createCollection(persistedCollectionOptions<VersionRow, string>(syncOptions<VersionRow>('versions', (apply) => { writers.versions = apply })))

  const executor: OfflineExecutor = startOfflineExecutor({
    collections: { plans, comments, catalog, settings, account, dashboards, versions },
    mutationFns: {
      submit: async ({ transaction, idempotencyKey }) => {
        const meta = transaction.metadata as QueuedMutation
        const result = await sendMutation(meta, idempotencyKey)
        results.set(idempotencyKey, result)
        return result
      },
    },
    shouldRetry: (error) => (error instanceof NonRetriableError ? false : undefined),
  })

  function notify(): void {
    paintOfflineStatus(handle, executor.getPendingCount(), failed, !reachable)
    for (const listener of listeners) listener()
  }

  async function sendMutation(meta: QueuedMutation, idempotencyKey: string): Promise<unknown> {
    const plan = plans.get(meta.planId)
    if (meta.kind === 'comment') {
      const partId = String((meta.body as { partId?: unknown } | null)?.partId ?? '')
      if (plan && !commentPartReady(plan.source, partId)) throw new NonRetriableError('The plan part is gone')
    }
    // The revision the person saw when they acted, so an agent edit made while offline is a conflict.
    const baseRevision = meta.baseRevision ?? plan?.revision ?? 0
    const body = { ...(meta.body && typeof meta.body === 'object' ? (meta.body as Record<string, unknown>) : {}), baseRevision }
    for (;;) {
      let response: Response
      try {
        response = await fetch(meta.path, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
          body: JSON.stringify(body),
        })
      } catch (error) {
        reachable = false
        notify()
        throw error
      }
      if (response.status === 401) {
        reachable = true
        await waitUntilAuthed(meta.basePath)
        continue
      }
      if (response.status === 409) {
        reachable = true
        void refreshPlan()
        throw new NonRetriableError((await response.text()) || 'Rejected')
      }
      if (!response.ok) throw new Error(`Request failed: ${response.status}`)
      reachable = true
      const payload = await response.json().catch(() => ({}))
      void refreshPlan()
      return payload
    }
  }

  async function refreshPlan(): Promise<void> {
    if (!document.getElementById('living-plan-mdx') && !document.getElementById('plan-mdx-root')) return
    // A version page embeds an old source. It is stored as a version, never as the live plan row.
    if (viewingPlanVersion() !== null) return
    const context = planContext()
    try {
      const response = await fetch(`${context.basePath}/api/snapshot`, { cache: 'no-store' })
      if (response.status === 401) {
        await waitUntilAuthed(context.basePath)
        return
      }
      if (!response.ok) return
      reachable = true
      publishSnapshot(context, (await response.json()) as PlanSnapshot)
    } catch {
      reachable = false
      notify()
    }
  }

  function publishSnapshot(context: ReturnType<typeof planContext>, snapshot: PlanSnapshot): void {
    const now = Date.now()
    const previous = plans.get(context.id)
    const row = planRowFromSnapshot(context.id, context.host, context.basePath, snapshot, previous, now)
    const keptPlans = [...plans.toArray].filter((entry) => entry.id !== row.id)
    const nextPlans = [...keptPlans, row]
    const ownedIds = [...catalog.toArray].map((entry) => entry.id)
    const drop = new Set(plansToEvict(nextPlans, openPlanId(), 4, ownedIds))
    if (drop.size > 0) forgetCachedDocuments([...drop].map((id) => `/plans/${id}`))
    const stored = [...comments.toArray]
    const pending = stored.filter((entry) => entry.pending)
    const nextComments = commentRowsFromSnapshot(context.id, snapshot.comments, pending).filter((entry) => !drop.has(entry.planId))
    const nextIds = new Set(nextComments.map((entry) => entry.id))
    const staleComments = stored
      .filter((entry) => entry.planId === context.id || drop.has(entry.planId) || entry.pending)
      .filter((entry) => !nextIds.has(entry.id))
      .map((entry) => entry.id)
    writers.plans?.({ put: drop.has(row.id) ? [] : [row], drop: [...drop] })
    writers.comments?.({ put: nextComments, drop: staleComments })
    notify()
  }

  function seedFromDocument(): void {
    if (viewingPlanVersion() !== null) return
    const context = planContext()
    if (plans.get(context.id)) return
    const node = document.getElementById('living-plan-mdx')
    if (!node?.textContent) return
    try {
      const parsed = JSON.parse(node.textContent) as Partial<PlanSnapshot>
      const commentsNode = document.getElementById('living-plan-comments')
      const embedded = commentsNode?.textContent ? (JSON.parse(commentsNode.textContent) as unknown[]) : []
      publishSnapshot(context, {
        revision: typeof parsed.revision === 'number' ? parsed.revision : 0,
        source: typeof parsed.source === 'string' ? parsed.source : '',
        title: typeof parsed.title === 'string' ? parsed.title : '',
        mode: document.body.dataset.planMode || 'watch',
        responses: parsed.responses && typeof parsed.responses === 'object' ? parsed.responses : {},
        comments: Array.isArray(embedded) ? embedded : [],
        review: null,
        locked: Boolean(parsed.locked),
      })
    } catch {
      // The embedded script is only a seed. A bad parse leaves the database empty.
    }
  }

  async function loadCatalog(): Promise<void> {
    const { refreshDeviceDashboards, syncOwnedPlans } = await import('./warmPlans.ts')
    if (location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/')) {
      const period = new URLSearchParams(location.search).get('period')
      const selected = period === 'week' || period === 'month' ? period : 'day'
      const result = await refreshDeviceDashboards(handle, { period: selected })
      if ('offline' in result && result.offline) {
        reachable = false
        notify()
      }
      return
    }
    await syncOwnedPlans(handle)
  }

  async function loadSettings(): Promise<void> {
    const context = planContext()
    const onPlan = Boolean(document.getElementById('living-plan-mdx') || document.getElementById('plan-mdx-root'))
    try {
      // A hosted plan takes its appearance from the account (`/api/account/settings`). Only the local service has a per-plan theme.
      if (onPlan && context.host !== 'cloud') {
        const response = await fetch(`${context.basePath}/api/theme`, { cache: 'no-store' })
        if (!response.ok) return
        const theme = (await response.json()) as Partial<SettingsRow>
        const row: SettingsRow = {
          id: `local:${context.id}`,
          accent: theme.accent ?? '#0f766e',
          pageWidth: theme.pageWidth ?? 'default',
          diffsTheme: theme.diffsTheme ?? 'pierre',
          wrapCode: Boolean(theme.wrapCode),
          updatedAt: typeof theme.updatedAt === 'number' ? theme.updatedAt : 0,
        }
        writers.settings?.({ put: [settingsWinner(settings.get(row.id) ?? row, row)] })
      } else if (!onPlan && (location.pathname.startsWith('/settings') || location.pathname.startsWith('/account'))) {
        const response = await fetch('/api/account', { cache: 'no-store' })
        if (!response.ok) return
        const payload = (await response.json()) as { settings?: Partial<SettingsRow> }
        const local = settings.get('account')
        handle.rememberAccount(accountWithSettings(payload, local?.pending ? local : undefined))
        const theme = payload.settings ?? {}
        const row: SettingsRow = {
          id: 'account',
          accent: theme.accent ?? '#0f766e',
          pageWidth: theme.pageWidth ?? 'default',
          diffsTheme: theme.diffsTheme ?? 'pierre',
          wrapCode: Boolean(theme.wrapCode),
          updatedAt: typeof theme.updatedAt === 'number' ? theme.updatedAt : 0,
        }
        writers.settings?.({ put: [settingsWinner(settings.get(row.id) ?? row, row)] })
      }
      reachable = true
    } catch {
      reachable = false
    }
  }

  const handle: OfflineHandle = {
    available: true,
    hydrated: false,
    plan: (id) => plans.get(id),
    comments: (planId) => [...comments.toArray].filter((row) => row.planId === planId),
    catalog: () => [...catalog.toArray],
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    syncPlan: () => refreshPlan(),
    noteLive: (event, data) => {
      const context = planContext()
      const current = plans.get(context.id)
      if (!current) return
      const next = applyLiveToPlan(current, event, data)
      writers.plans?.({ put: [next] })
      if (event === 'comment' && data && typeof data === 'object') {
        const comment = data as Record<string, unknown>
        const id = typeof comment.id === 'string' ? comment.id : ''
        if (!id) return
        writers.comments?.({
          put: [{ id, planId: context.id, partId: typeof comment.partId === 'string' ? comment.partId : '', pending: false, comment }],
        })
      }
    },
    submit: async ({ kind, path, body }) => {
      const context = planContext()
      const idempotencyKey = crypto.randomUUID()
      const metadata: QueuedMutation = {
        kind,
        path,
        body,
        basePath: context.basePath,
        planId: context.id,
        baseRevision: plans.get(context.id)?.revision,
      }
      // autoCommit stays off: mutate() would commit, and the commit() below would then throw.
      const transaction = executor.createOfflineTransaction({
        mutationFnName: 'submit',
        autoCommit: false,
        idempotencyKey,
        metadata,
      })
      transaction.mutate(() => {
        rememberOptimistic(plans, comments, context.id, kind, body, idempotencyKey)
      })
      const settled = transaction
        .commit()
        .then(() => ({ ok: true as const, status: 200, body: results.get(idempotencyKey) ?? null, text: '' }))
        .catch((error: unknown) => {
          failed += 1
          notify()
          const message = error instanceof Error ? error.message : 'Could not send'
          return { ok: false as const, status: 409, body: null, text: message }
        })
      if (!navigator.onLine) {
        reachable = false
        notify()
        return { ok: true, status: 202, body: optimisticBody(kind, body, idempotencyKey), text: '', queued: true }
      }
      return Promise.race([
        settled,
        wait(2500).then(() => ({ ok: true as const, status: 202, body: optimisticBody(kind, body, idempotencyKey), text: '', queued: true })),
      ])
    },
    rememberCatalog: (rows) => {
      const previous = [...catalog.toArray].map((row) => row.id)
      const nextIds = new Set(rows.map((row) => row.id))
      const released = previous.filter((id) => !nextIds.has(id))
      // warmedAt is left out so this merge keeps the time markWarmed wrote, even one still being saved.
      writers.catalog?.({ put: rows.map(({ warmedAt: _warmedAt, ...row }) => row as CatalogRow), drop: released })
      const drop = new Set(plansToEvict([...plans.toArray], openPlanId(), 4, rows.map((row) => row.id), released))
      // Versions are kept for owned plans only.
      const releasedSet = new Set(released)
      const staleVersions = [...versions.toArray].filter((row) => releasedSet.has(row.planId)).map((row) => row.id)
      if (staleVersions.length > 0) writers.versions?.({ drop: staleVersions })
      if (drop.size > 0) {
        writers.plans?.({ drop: [...drop] })
        writers.comments?.({ drop: [...comments.toArray].filter((row) => drop.has(row.planId)).map((row) => row.id) })
        forgetCachedDocuments([...drop].map((id) => `/plans/${id}`))
      }
      notify()
    },
    account: () => account.get('me') ?? null,
    rememberAccount: (payload) => {
      writers.account?.({ put: [{ id: 'me', payload, savedAt: Date.now() }] })
      notify()
    },
    dashboard: (period) => dashboards.get(period) ?? null,
    rememberDashboard: (period, payload) => {
      writers.dashboards?.({ put: [{ id: period, payload, savedAt: Date.now() }] })
      notify()
    },
    storePlanSnapshot: (id, basePath, snapshot) => {
      publishSnapshot({ id, host: basePath.startsWith('/plans/') ? 'cloud' : 'local', basePath }, snapshot)
    },
    versions: (planId) =>
      [...versions.toArray].filter((row) => row.planId === planId).sort((left, right) => right.seq - left.seq),
    rememberVersions: (planId, listed) => {
      const change = versionRowsFromList(planId, listed, [...versions.toArray])
      writers.versions?.(change)
      notify()
    },
    rememberVersion: (row) => {
      writers.versions?.({ put: [{ ...row, id: versionRowId(row.planId, row.seq) }] })
      notify()
    },
    markWarmed: (id, versionKey, warmedAt) => {
      // Catalog puts merge, so this changes only these two fields of a row that is still listed.
      if (!catalog.get(id)) return
      writers.catalog?.({ put: [{ id, versionKey, warmedAt } as CatalogRow] })
    },
    pendingCount: () => executor.getPendingCount(),
    noteNetwork: (online) => {
      reachable = online
      notify()
    },
    clearDevice: async (options) => {
      const pending = executor.getPendingCount()
      if (pending > 0 && !options?.force) {
        const noun = pending === 1 ? '1 change has' : `${pending} changes have`
        if (!window.confirm(`${noun} not been sent. Sign out anyway?`)) return false
      }
      if (executor.getPendingCount() > 0) await executor.clearOutbox()
      writers.plans?.({ replace: [] })
      writers.comments?.({ replace: [] })
      writers.catalog?.({ replace: [] })
      writers.settings?.({ replace: [] })
      writers.account?.({ replace: [] })
      writers.dashboards?.({ replace: [] })
      writers.versions?.({ replace: [] })
      forgetCachedDocuments()
      notify()
      return true
    },
    settings: (scope) => settings.get(scope),
    saveSettings: async (scope, patch) => {
      const current = settings.get(scope)
      const next: SettingsRow = {
        id: scope,
        accent: patch.accent ?? current?.accent ?? '#0f766e',
        pageWidth: patch.pageWidth ?? current?.pageWidth ?? 'default',
        diffsTheme: patch.diffsTheme ?? current?.diffsTheme ?? 'pierre',
        wrapCode: patch.wrapCode ?? current?.wrapCode ?? false,
        updatedAt: Math.max(Date.now(), (current?.updatedAt ?? 0) + 1),
        pending: true,
        url: patch.url,
      }
      writeSettings(next)
      if (scope === 'account') patchStoredAccount(next)
      await pushSettings(next)
    },
  }

  function writeSettings(row: SettingsRow): void {
    writers.settings?.({ put: [row] })
  }

  /** Keep the stored account in step, so the settings page and dashboard read the change offline. */
  function patchStoredAccount(row: SettingsRow): void {
    const stored = account.get('me')
    if (!stored) return
    writers.account?.({ put: [{ ...stored, payload: accountWithSettings(stored.payload, row) }] })
  }

  /** Send one settings row. It stays pending on a network failure and is sent again when the network returns. */
  async function pushSettings(row: SettingsRow): Promise<void> {
    if (!row.url) return
    try {
      const response = await fetch(row.url, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          accent: row.accent,
          pageWidth: row.pageWidth,
          diffsTheme: row.diffsTheme,
          wrapCode: row.wrapCode,
          updatedAt: row.updatedAt,
        }),
      })
      reachable = true
      const latest = settings.get(row.id)
      // A rejected change (signed out, bad value) is dropped. Only a newer edit keeps the pending flag.
      if (latest && latest.updatedAt === row.updatedAt) writeSettings({ ...latest, pending: false })
      if (!response.ok) window.showPlanToast?.('Could not save those settings.')
    } catch {
      reachable = false
    }
    notify()
  }

  async function flushSettings(): Promise<void> {
    if (!navigator.onLine) return
    for (const row of [...settings.toArray]) {
      if (row.pending) await pushSettings(row)
    }
  }

  await Promise.all([plans.preload(), comments.preload(), catalog.preload(), settings.preload(), account.preload(), dashboards.preload(), versions.preload()].map((job) => job.catch(() => undefined)))
  handle.hydrated = true
  seedFromDocument()
  void refreshPlan()
  void loadCatalog()
  void flushSettings().then(() => loadSettings())
  if (account.get('me') && !location.pathname.startsWith('/settings')) {
    void import('./warmPlans.ts').then(({ warmSettingsPage }) => warmSettingsPage(handle))
  }
  window.addEventListener('offline', () => {
    reachable = false
    notify()
  })
  window.addEventListener('online', () => {
    reachable = true
    void refreshPlan()
    void flushSettings()
    void loadCatalog()
    notify()
  })
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    void loadCatalog()
  })
  window.setInterval(() => {
    if (navigator.onLine && document.visibilityState !== 'hidden') void loadCatalog()
  }, 60_000)
  comments.subscribeChanges(() => notify())
  versions.subscribeChanges(() => notify())
  plans.subscribeChanges(() => notify())
  notify()
  return handle
}

function rememberOptimistic(
  plans: Collection<PlanRow, string>,
  comments: Collection<CommentRow, string>,
  planId: string,
  kind: UserMutationKind,
  body: unknown,
  idempotencyKey: string,
): void {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  if (kind === 'comment') {
    const id = `pending:${idempotencyKey}`
    comments.insert({
      id,
      planId,
      partId: String(record.partId ?? ''),
      pending: true,
      comment: {
        id,
        partId: String(record.partId ?? ''),
        kind: String(record.kind ?? 'part'),
        text: String(record.text ?? ''),
        excerpt: String(record.excerpt ?? ''),
        createdAt: Date.now(),
        addressingAt: null,
        addressedAt: null,
      },
    })
  }
  if (kind === 'mode' && plans.get(planId) && (record.mode === 'watch' || record.mode === 'comment' || record.mode === 'review')) {
    plans.update([planId], (drafts) => {
      const draft = drafts[0]
      if (draft) draft.mode = record.mode as PlanRow['mode']
    })
  }
  if (kind === 'interaction' && plans.get(planId) && typeof record.id === 'string') {
    plans.update([planId], (drafts) => {
      const draft = drafts[0]
      if (draft) draft.responses = { ...draft.responses, [record.id as string]: record }
    })
  }
}

function optimisticBody(kind: UserMutationKind, body: unknown, idempotencyKey: string): unknown {
  if (kind !== 'comment' && kind !== 'reply') return { ok: true }
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  return {
    ok: true,
    comment: {
      id: `pending:${idempotencyKey}`,
      partId: String(record.partId ?? ''),
      kind: String(record.kind ?? 'part'),
      text: String(record.text ?? ''),
      excerpt: String(record.excerpt ?? ''),
      createdAt: Date.now(),
      addressingAt: null,
      addressedAt: null,
    },
  }
}

function openPlanId(): string {
  const match = location.pathname.match(/^\/plans\/([A-Za-z0-9_-]{8,80})$/)
  return match?.[1] ?? ''
}

function emptySettings(id: string): SettingsRow {
  return { id, accent: '#0f766e', pageWidth: 'default', diffsTheme: 'pierre', wrapCode: false, updatedAt: 0 }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntilAuthed(basePath: string): Promise<void> {
  for (;;) {
    if (!navigator.onLine) {
      await new Promise<void>((resolve) => window.addEventListener('online', () => resolve(), { once: true }))
    }
    try {
      const response = await fetch(`${basePath}/api/snapshot`, { cache: 'no-store' })
      if (response.status !== 401) return
    } catch {
      // Stay on this outbox row until the host answers.
    }
    await wait(2000)
  }
}
