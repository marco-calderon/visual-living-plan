/**
 * Offline sync contract shared by the local session and the Durable Object.
 * The browser stores rows. These functions decide whether a write is a replay,
 * a conflict, or a new submission. They do not open a database.
 */

export const SOURCE_BODY_CAP = 500_000

/** Owned plans kept on this device. Shared plans the person only opened stay at the smaller cap. */
export const OWNED_PLAN_CAP = 50

/** Skip a warm or a background dashboard fetch when the device copy is newer than this. */
export const WARM_INTERVAL_MS = 10 * 60 * 1000

export const USER_MUTATIONS = ['interaction', 'comment', 'reply', 'address', 'addressing', 'review', 'mode'] as const

export type UserMutationKind = (typeof USER_MUTATIONS)[number]

const FORM_LOCK = new Set<UserMutationKind>(['interaction', 'comment', 'reply', 'address', 'addressing', 'review'])

export type IdempotencyRecord = {
  key: string
  body: string
  result: unknown
}

export type PlanSnapshot = {
  revision: number
  source: string
  title: string
  mode: string
  responses: Record<string, unknown>
  comments: unknown[]
  review: unknown
  locked: boolean
}

export type PlanRow = {
  id: string
  revision: number
  source: string
  title: string
  mode: string
  responses: Record<string, unknown>
  review: unknown
  locked: boolean
  host: 'local' | 'cloud'
  basePath: string
  openedAt: number
  sourceOmitted: boolean
}

export type CommentRow = {
  id: string
  planId: string
  partId: string
  pending: boolean
  comment: Record<string, unknown>
}

export type CatalogRow = {
  id: string
  title: string
  mode: string
  status: string
  versionLabel: string
  /** `heartbeatAt/storedPath` from the last dashboard row. Absent on older device rows. */
  versionKey?: string
  warmedAt?: number
  recency?: number
}

/** One saved version of an owned plan. `source` is present once that version was opened on this device. */
export type VersionRow = {
  /** `planId:seq` */
  id: string
  planId: string
  seq: number
  title: string
  createdAt: number
  source?: string
}

export function versionRowId(planId: string, seq: number): string {
  return `${planId}:${seq}`
}

/**
 * Rows to write and drop after the host listed a plan's versions. A listed row keeps a source this
 * device already saved. A stored row the host no longer lists is dropped.
 */
export function versionRowsFromList(
  planId: string,
  listed: ReadonlyArray<{ seq: number; title?: string; createdAt?: number }>,
  stored: readonly VersionRow[],
): { put: VersionRow[]; drop: string[] } {
  const mine = stored.filter((row) => row.planId === planId)
  const byId = new Map(mine.map((row) => [row.id, row]))
  const put: VersionRow[] = []
  const keep = new Set<string>()
  for (const version of listed) {
    if (!Number.isInteger(version.seq) || version.seq <= 0) continue
    const id = versionRowId(planId, version.seq)
    if (keep.has(id)) continue
    keep.add(id)
    const previous = byId.get(id)
    put.push({
      id,
      planId,
      seq: version.seq,
      title: version.title ?? previous?.title ?? '',
      createdAt: version.createdAt ?? previous?.createdAt ?? 0,
      ...(previous?.source !== undefined ? { source: previous.source } : {}),
    })
  }
  const drop = mine.filter((row) => !keep.has(row.id)).map((row) => row.id)
  return { put, drop }
}

export type AccountRow = {
  id: string
  payload: unknown
  savedAt: number
}

export type DashboardStoreRow = {
  id: string
  payload: unknown
  savedAt: number
}

export type WarmPlan = {
  id: string
  versionKey: string
  recency: number
}

export type SettingsRow = {
  id: string
  accent: string
  pageWidth: string
  diffsTheme: string
  wrapCode: boolean
  updatedAt: number
  /** Set while the host has not confirmed this change. Sent again when the network returns. */
  pending?: boolean
  /** Where a pending change is sent. */
  url?: string
}

/** A device settings row from a host theme or settings payload, with the same defaults the host uses. */
export function settingsRowFrom(id: string, theme: Partial<SettingsRow> | null | undefined): SettingsRow {
  const value = theme ?? {}
  return {
    id,
    accent: typeof value.accent === 'string' && value.accent ? value.accent : '#0f766e',
    pageWidth: typeof value.pageWidth === 'string' && value.pageWidth ? value.pageWidth : 'default',
    diffsTheme: typeof value.diffsTheme === 'string' && value.diffsTheme ? value.diffsTheme : 'pierre',
    wrapCode: Boolean(value.wrapCode),
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
  }
}

/** The settings fields of a stored account payload, replaced by a newer device row. */
export function accountWithSettings<T>(payload: T, row: SettingsRow | undefined): T {
  if (!row || !payload || typeof payload !== 'object') return payload
  const record = payload as Record<string, unknown>
  const current = record.settings && typeof record.settings === 'object' ? (record.settings as Record<string, unknown>) : {}
  const currentAt = typeof current.updatedAt === 'number' ? current.updatedAt : 0
  if (row.updatedAt <= currentAt) return payload
  return {
    ...record,
    settings: {
      ...current,
      accent: row.accent,
      pageWidth: row.pageWidth,
      diffsTheme: row.diffsTheme,
      wrapCode: row.wrapCode,
      updatedAt: row.updatedAt,
    },
  } as T
}

export type MutationInspection = {
  kind: UserMutationKind
  key: string | null
  body: unknown
  baseRevision: number | null
  currentRevision: number
  executionActive: boolean
  source: string
  records: readonly IdempotencyRecord[]
}

export type MutationInspectionResult =
  | { action: 'replay'; result: unknown }
  | { action: 'reject'; status: 409; message: string }
  | { action: 'apply'; body: unknown; key: string | null }

export function canonicalMutationBody(body: unknown): string {
  return JSON.stringify(sortKeys(stripBaseRevision(body)))
}

export function stripBaseRevision(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body ?? {}
  const rest = { ...(body as Record<string, unknown>) }
  delete rest.baseRevision
  return rest
}

export function readBaseRevision(body: unknown): number | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const value = (body as { baseRevision?: unknown }).baseRevision
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

export function readUpdatedAt(body: unknown): number | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const value = (body as { updatedAt?: unknown }).updatedAt
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Same key and body replays. A stale revision, a reused key, or a locked form rejects. */
export function inspectMutation(input: MutationInspection): MutationInspectionResult {
  const body = stripBaseRevision(input.body)
  const canonical = canonicalMutationBody(body)
  if (input.key) {
    const stored = input.records.find((record) => record.key === input.key)
    if (stored && stored.body === canonical) return { action: 'replay', result: stored.result }
    if (stored) return { action: 'reject', status: 409, message: 'Idempotency key reused with a different body' }
  }
  const offline = input.key != null || input.baseRevision != null
  if (offline && FORM_LOCK.has(input.kind) && input.executionActive) {
    return { action: 'reject', status: 409, message: 'Execution is active' }
  }
  if (offline && input.kind === 'comment') {
    const partId = String((body as { partId?: unknown }).partId ?? '')
    if (!commentPartReady(input.source, partId)) {
      return { action: 'reject', status: 409, message: 'The plan part is gone' }
    }
  }
  if (offline && input.baseRevision != null && input.baseRevision !== input.currentRevision) {
    return { action: 'reject', status: 409, message: 'Stale revision' }
  }
  return { action: 'apply', body, key: input.key }
}

export function rememberMutation(
  records: readonly IdempotencyRecord[],
  key: string,
  body: unknown,
  result: unknown,
): IdempotencyRecord[] {
  const next = records.filter((record) => record.key !== key)
  next.push({ key, body: canonicalMutationBody(body), result: cloneResult(result) })
  return next.slice(-200)
}

const BLOCK_TAGS = new Set(['phase', 'callout', 'choice', 'approve', 'form', 'questions', 'checklist', 'workflow'])

/**
 * A tray message is not a document part. A quoted part must still be in the source.
 * A part id is `<kind>:<block>/<child>...` (see planPartScope). The block is checked by its
 * `<kind id="...">` tag. Prose (`markdown:<n>`) and blocks without an id are scoped by position,
 * which the source cannot confirm, so those are accepted.
 */
export function commentPartReady(source: string, partId: string): boolean {
  if (!partId) return false
  if (partId.startsWith('review:')) return true
  const head = partId.split('/')[0] ?? ''
  const colon = head.indexOf(':')
  if (colon <= 0) return source.includes(partId)
  const kind = head.slice(0, colon)
  const id = head.slice(colon + 1)
  if (!id) return false
  if (kind === 'markdown' || /^\d+$/.test(id)) return true
  if (!BLOCK_TAGS.has(kind)) return source.includes(id)
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`<${kind}\\b[^>]*\\bid\\s*=\\s*["']${escaped}["']`).test(source)
}

/** Agent source replaces the browser copy when the server revision has moved or the text differs. */
export function mergeAgentDocument(
  local: { revision: number; source: string },
  agent: { revision: number; source: string },
): { revision: number; source: string; replaced: boolean } {
  if (agent.revision > local.revision || (agent.revision === local.revision && agent.source !== local.source)) {
    return { revision: agent.revision, source: agent.source, replaced: true }
  }
  return { revision: local.revision, source: local.source, replaced: false }
}

export function sourceForStore(previous: string, incoming: string): { source: string; sourceOmitted: boolean } {
  if (incoming.length > SOURCE_BODY_CAP) return { source: previous, sourceOmitted: true }
  return { source: incoming, sourceOmitted: false }
}

function keepPendingResponses(
  previous: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const responses = { ...incoming }
  if (!previous) return responses
  for (const [id, value] of Object.entries(previous)) {
    if (!Object.prototype.hasOwnProperty.call(incoming, id)) responses[id] = value
  }
  return responses
}

export function planRowFromSnapshot(
  id: string,
  host: PlanRow['host'],
  basePath: string,
  snapshot: PlanSnapshot,
  previous: PlanRow | undefined,
  now: number,
): PlanRow {
  const stored = sourceForStore(previous?.source ?? '', snapshot.source)
  const merged = mergeAgentDocument(
    { revision: previous?.revision ?? -1, source: previous?.source ?? '' },
    { revision: snapshot.revision, source: stored.sourceOmitted ? (previous?.source ?? '') : stored.source },
  )
  return {
    id,
    revision: snapshot.revision,
    source: stored.sourceOmitted ? merged.source : stored.source,
    title: snapshot.title,
    mode: snapshot.mode,
    responses: keepPendingResponses(previous?.responses, snapshot.responses),
    review: snapshot.review,
    locked: snapshot.locked,
    host,
    basePath,
    openedAt: now,
    sourceOmitted: stored.sourceOmitted,
  }
}

export function commentRowsFromSnapshot(planId: string, comments: unknown[], pending: readonly CommentRow[]): CommentRow[] {
  const server: CommentRow[] = []
  for (const entry of comments) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const comment = entry as Record<string, unknown>
    const id = typeof comment.id === 'string' ? comment.id : ''
    if (!id) continue
    server.push({
      id,
      planId,
      partId: typeof comment.partId === 'string' ? comment.partId : '',
      pending: false,
      comment,
    })
  }
  const ids = new Set(server.map((row) => row.id))
  return [...server, ...pending.filter((row) => row.pending && row.planId === planId && !ids.has(row.id))]
}

export function planVersionKey(plan: { heartbeatAt?: number | null; storedPath?: string | null }): string {
  const heartbeat = typeof plan.heartbeatAt === 'number' && Number.isFinite(plan.heartbeatAt) ? plan.heartbeatAt : 0
  const stored = typeof plan.storedPath === 'string' ? plan.storedPath : ''
  return `${heartbeat}/${stored}`
}

export function dashboardFetchDue(savedAt: number | undefined, now: number, interval = WARM_INTERVAL_MS): boolean {
  if (!savedAt) return true
  return now - savedAt >= interval
}

/**
 * Owned plans up to the cap are kept. Plans past that cap, and plans the person
 * no longer owns (`releasedIds`), are dropped. Other plans keep the last `keep`
 * opened copies. The plan open on this page is kept either way.
 */
export function plansToEvict(
  rows: readonly { id: string; openedAt: number }[],
  openId: string,
  keep = 4,
  ownedIds: readonly string[] = [],
  releasedIds: readonly string[] = [],
): string[] {
  const ownedSet = new Set<string>()
  for (const id of ownedIds) {
    if (!id || ownedSet.has(id)) continue
    ownedSet.add(id)
    if (ownedSet.size >= OWNED_PLAN_CAP) break
  }
  const released = new Set(releasedIds.filter((id) => id && !ownedSet.has(id)))
  for (const id of ownedIds) {
    if (!ownedSet.has(id)) released.add(id)
  }
  const shared = rows
    .filter((row) => !ownedSet.has(row.id) && !released.has(row.id) && row.id !== openId)
    .slice()
    .sort((left, right) => right.openedAt - left.openedAt)
  const openIsShared = Boolean(openId) && !ownedSet.has(openId) && !released.has(openId)
  const sharedRoom = Math.max(0, keep - (openIsShared ? 1 : 0))
  const kept = new Set<string>(ownedSet)
  if (openId) kept.add(openId)
  for (const row of shared.slice(0, sharedRoom)) kept.add(row.id)
  return rows.map((row) => row.id).filter((id) => !kept.has(id))
}

/**
 * Plan HTML is cached by the service worker only after that worker controls the page.
 * With no worker support, the device snapshot is the offline copy.
 */
export function planPageCacheReady(input: { serviceWorker: boolean; controller: boolean }): boolean {
  if (!input.serviceWorker) return true
  return input.controller
}

/** Most recent owned plans that are new, changed, or last warmed longer ago than the interval. */
export function plansToWarm(
  owned: readonly WarmPlan[],
  warmed: readonly { id: string; versionKey?: string; warmedAt?: number }[],
  now: number,
  cap = OWNED_PLAN_CAP,
): string[] {
  const ranked = owned
    .filter((plan) => plan.id)
    .slice()
    .sort((left, right) => right.recency - left.recency || left.id.localeCompare(right.id))
    .slice(0, cap)
  const previous = new Map(warmed.map((row) => [row.id, row]))
  const due: string[] = []
  for (const plan of ranked) {
    const last = previous.get(plan.id)
    if (!last || (last.versionKey ?? '') !== plan.versionKey) {
      due.push(plan.id)
      continue
    }
    if (now - (last.warmedAt ?? 0) >= WARM_INTERVAL_MS) due.push(plan.id)
  }
  return due
}

type OwnedCatalogPlan = {
  id?: unknown
  title?: unknown
  mode?: unknown
  status?: unknown
  outcome?: unknown
  heartbeatAt?: unknown
  startedAt?: unknown
  storedPath?: unknown
}

/** The warm list: owned ids, with version keys taken from dashboard rows when we have them. */
export function catalogFromOwned(
  accountPlans: readonly { id?: unknown; title?: unknown; mode?: unknown }[],
  dashboardPlans: readonly OwnedCatalogPlan[],
  previous: readonly CatalogRow[] = [],
): CatalogRow[] {
  const dash = new Map<string, OwnedCatalogPlan>()
  for (const plan of dashboardPlans) {
    const id = typeof plan.id === 'string' ? plan.id : ''
    if (id) dash.set(id, plan)
  }
  const prior = new Map(previous.map((row) => [row.id, row]))
  const ranked = accountPlans
    .map((plan) => {
      const id = typeof plan.id === 'string' ? plan.id : ''
      const row = id ? dash.get(id) : undefined
      const heartbeat = typeof row?.heartbeatAt === 'number' ? row.heartbeatAt : 0
      const started = typeof row?.startedAt === 'number' ? row.startedAt : 0
      return { plan, row, id, recency: Math.max(heartbeat, started) }
    })
    .filter((entry) => entry.id)
    .sort((left, right) => right.recency - left.recency || left.id.localeCompare(right.id))
    .slice(0, OWNED_PLAN_CAP)
  return ranked.map(({ plan, row, id, recency }) => {
    const old = prior.get(id)
    const versionKey = planVersionKey({
      heartbeatAt: typeof row?.heartbeatAt === 'number' ? row.heartbeatAt : null,
      storedPath: typeof row?.storedPath === 'string' ? row.storedPath : null,
    })
    const outcome = typeof row?.outcome === 'string' ? row.outcome : ''
    return {
      id,
      title: text(row?.title) || text(plan.title) || old?.title || '',
      mode: text(row?.mode) || text(plan.mode) || old?.mode || '',
      status: text(row?.status) || old?.status || '',
      versionLabel: outcome || old?.versionLabel || '',
      versionKey,
      warmedAt: old?.warmedAt,
      recency,
    }
  })
}

/**
 * The dashboard loader: a failed fetch in the browser can use the stored account.
 * A real `!ok` (401) is still a sign-in redirect. Anything else surfaces as an error.
 */
export function dashboardAccountDecision(input: {
  ok: boolean | null
  networkFailure: boolean
  hasStored: boolean
}): 'account' | 'stored' | 'login' | 'error' {
  if (input.ok === true) return 'account'
  if (input.ok === false) return 'login'
  if (input.networkFailure && input.hasStored) return 'stored'
  return 'error'
}

export function isAccountNetworkFailure(error: unknown, online: boolean): boolean {
  if (!online) return true
  if (error instanceof TypeError) return true
  if (error instanceof Error && /failed to fetch|networkerror|load failed|network request failed/i.test(error.message)) return true
  return false
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function catalogRows(
  plans: readonly { id?: unknown; title?: unknown; mode?: unknown; status?: unknown; versionLabel?: unknown }[],
): CatalogRow[] {
  const rows: CatalogRow[] = []
  for (const plan of plans) {
    const id = typeof plan.id === 'string' ? plan.id : ''
    if (!id) continue
    rows.push({
      id,
      title: typeof plan.title === 'string' ? plan.title : '',
      mode: typeof plan.mode === 'string' ? plan.mode : '',
      status: typeof plan.status === 'string' ? plan.status : '',
      versionLabel: typeof plan.versionLabel === 'string' ? plan.versionLabel : '',
    })
  }
  return rows
}

export function settingsWinner<T extends { updatedAt?: number }>(current: T, incoming: T): T {
  const currentAt = current.updatedAt ?? 0
  const incomingAt = incoming.updatedAt ?? 0
  if (incomingAt > 0 && currentAt > incomingAt) return current
  return incoming
}

export function applyLiveToPlan(row: PlanRow, event: string, data: unknown): PlanRow {
  if (!data || typeof data !== 'object') return row
  const record = data as Record<string, unknown>
  if (event === 'plan') {
    const incomingSource = typeof record.source === 'string' ? record.source : row.source
    const stored = sourceForStore(row.source, incomingSource)
    const revision = typeof record.revision === 'number' ? record.revision : row.revision
    const merged = mergeAgentDocument(
      { revision: row.revision, source: row.source },
      { revision, source: stored.sourceOmitted ? row.source : stored.source },
    )
    return {
      ...row,
      revision: merged.revision,
      source: merged.source,
      sourceOmitted: stored.sourceOmitted,
      title: typeof record.title === 'string' ? record.title : row.title,
      responses:
        record.responses && typeof record.responses === 'object' && !Array.isArray(record.responses)
          ? (record.responses as Record<string, unknown>)
          : row.responses,
      locked: record.locked === undefined ? row.locked : Boolean(record.locked),
    }
  }
  if (event === 'mode') {
    const mode = record.mode
    if (mode === 'watch' || mode === 'comment' || mode === 'review') return { ...row, mode }
  }
  if (event === 'execution') return { ...row, locked: Boolean(record.active) }
  if (event === 'review') return { ...row, review: data }
  if (event === 'hello') {
    // Sent each time the page's stream opens: the run, the mode, and the review as they are now.
    let next = row
    const execution = record.execution
    if (execution && typeof execution === 'object') next = { ...next, locked: Boolean((execution as { active?: unknown }).active) }
    const mode = record.mode
    if (mode === 'watch' || mode === 'comment' || mode === 'review') next = { ...next, mode }
    if ('review' in record) next = { ...next, review: record.review }
    return next
  }
  return row
}

export function offlineStatusText(input: {
  available: boolean
  offline: boolean
  pending: number
  failed: number
}): string | null {
  if (!input.available) return null
  if (input.failed > 0) {
    const failed = input.failed === 1 ? '1 failed' : `${input.failed} failed`
    return input.offline ? `Offline · ${failed}` : failed
  }
  if (input.offline && input.pending > 0) return `Offline · ${input.pending} pending`
  if (input.offline) return 'Offline'
  if (input.pending > 0) return `${input.pending} pending`
  return null
}

function cloneResult(result: unknown): unknown {
  return JSON.parse(JSON.stringify(result)) as unknown
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(record).sort()) sorted[key] = sortKeys(record[key])
  return sorted
}
