/**
 * Offline sync contract shared by the local session and the Durable Object.
 * The browser stores rows. These functions decide whether a write is a replay,
 * a conflict, or a new submission. They do not open a database.
 */

export const SOURCE_BODY_CAP = 500_000

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
}

export type SettingsRow = {
  id: string
  accent: string
  pageWidth: string
  diffsTheme: string
  wrapCode: boolean
  updatedAt: number
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

/** A tray message is not a document part. A quoted part must still be in the source. */
export function commentPartReady(source: string, partId: string): boolean {
  if (!partId) return false
  if (partId.startsWith('review:')) return true
  return source.includes(partId)
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

export function plansToEvict(rows: readonly { id: string; openedAt: number }[], openId: string, keep = 4): string[] {
  const others = rows
    .filter((row) => row.id !== openId)
    .slice()
    .sort((left, right) => right.openedAt - left.openedAt)
  const kept = new Set([openId, ...others.slice(0, Math.max(0, keep - 1)).map((row) => row.id)])
  return rows.map((row) => row.id).filter((id) => !kept.has(id))
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
