import { allows, normalizeTier, SOCKET_CAPS, type Tier } from './access'

export type PlanRows = { toArray(): Array<Record<string, unknown>> }
export type PlanSql = { exec(query: string, ...bindings: unknown[]): PlanRows }

export class PlanRoomError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export class StaleRevision extends PlanRoomError {
  constructor(readonly revision: number) {
    super(409, 'Stale revision')
  }
}

export type Outbound = { event: string; data: unknown }

const encoder = new TextEncoder()

export function secretEquals(expected: string, actual: string): boolean {
  const left = encoder.encode(expected)
  const right = encoder.encode(actual)
  if (left.length !== right.length || left.length === 0) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) diff |= (left[index] ?? 0) ^ (right[index] ?? 0)
  return diff === 0
}

function randomId(prefix: string): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return `${prefix}${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

export function migratePlan(sql: PlanSql): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`)
  sql.exec(
    `CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      seq INTEGER NOT NULL,
      event TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      delivered_at INTEGER
    )`,
  )
}

function meta(sql: PlanSql, key: string): string | null {
  const row = sql.exec(`SELECT value FROM meta WHERE key = ?`, key).toArray()[0]
  return typeof row?.value === 'string' ? row.value : null
}

function setMeta(sql: PlanSql, key: string, value: string): void {
  sql.exec(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value)
}

function jsonMeta<T>(sql: PlanSql, key: string, fallback: T): T {
  const raw = meta(sql, key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function requireOpen(sql: PlanSql): void {
  if (meta(sql, 'closed') === '1') throw new PlanRoomError(409, 'This plan is closed.')
}

export function initPlan(
  sql: PlanSql,
  input: { token: string; title: string; mode: string; tier: string; source: string },
): { revision: number } {
  migratePlan(sql)
  const existing = meta(sql, 'token')
  if (existing) {
    if (!secretEquals(existing, input.token)) throw new PlanRoomError(409, 'This plan is already hosted.')
    return { revision: Number(meta(sql, 'revision') ?? '0') }
  }
  setMeta(sql, 'token', input.token)
  setMeta(sql, 'title', input.title)
  setMeta(sql, 'mode', input.mode)
  setMeta(sql, 'tier', normalizeTier(input.tier))
  setMeta(sql, 'source', input.source)
  setMeta(sql, 'revision', '0')
  setMeta(sql, 'responses', '{}')
  setMeta(sql, 'comments', '[]')
  setMeta(sql, 'review', 'null')
  setMeta(sql, 'execution', JSON.stringify({ active: false }))
  setMeta(sql, 'closed', '0')
  setMeta(sql, 'last_seen', String(Date.now()))
  return { revision: 0 }
}

export function planToken(sql: PlanSql): string {
  migratePlan(sql)
  const token = meta(sql, 'token')
  if (!token) throw new PlanRoomError(404, 'Plan not found')
  return token
}

export function touchPlan(sql: PlanSql): void {
  setMeta(sql, 'last_seen', String(Date.now()))
}

export function planTier(sql: PlanSql): Tier {
  return normalizeTier(meta(sql, 'tier'))
}

export function socketLimit(sql: PlanSql): number {
  return SOCKET_CAPS[planTier(sql)]
}

export type PlanView = {
  title: string
  source: string
  mode: string
  revision: number
  responses: Record<string, unknown>
  comments: unknown[]
  review: unknown
  theme: unknown
  git: unknown
  execution: unknown
  tier: Tier
  closed: boolean
}

export function planView(sql: PlanSql): PlanView {
  migratePlan(sql)
  return {
    title: meta(sql, 'title') ?? 'Living plan',
    source: meta(sql, 'source') ?? '',
    mode: meta(sql, 'mode') ?? 'watch',
    revision: Number(meta(sql, 'revision') ?? '0'),
    responses: jsonMeta(sql, 'responses', {}),
    comments: jsonMeta(sql, 'comments', []),
    review: jsonMeta(sql, 'review', null),
    theme: jsonMeta(sql, 'theme', null),
    git: jsonMeta(sql, 'git', null),
    execution: jsonMeta(sql, 'execution', { active: false }),
    tier: planTier(sql),
    closed: meta(sql, 'closed') === '1',
  }
}

export function pendingEvents(sql: PlanSql): Array<Record<string, unknown>> {
  return sql
    .exec(`SELECT id, seq, event, data, created_at, delivered_at FROM events WHERE delivered_at IS NULL ORDER BY seq`)
    .toArray()
    .map(eventRow)
}

function eventRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    seq: row.seq,
    event: row.event,
    data: JSON.parse(String(row.data ?? 'null')),
    createdAt: row.created_at,
    deliveredAt: row.delivered_at ?? null,
  }
}

function pushEvent(sql: PlanSql, event: string, data: unknown): Record<string, unknown> {
  const seqRow = sql.exec(`SELECT COALESCE(MAX(seq), 0) AS seq FROM events`).toArray()[0]
  const seq = Number(seqRow?.seq ?? 0) + 1
  const record = {
    id: randomId('evt_'),
    seq,
    event,
    data,
    createdAt: Date.now(),
    deliveredAt: null,
  }
  sql.exec(
    `INSERT INTO events (id, seq, event, data, created_at, delivered_at) VALUES (?, ?, ?, ?, ?, NULL)`,
    record.id,
    record.seq,
    record.event,
    JSON.stringify(data),
    record.createdAt,
  )
  return record
}

export function putSource(
  sql: PlanSql,
  input: { markdown: string; revision: number; title?: string },
): { revision: number; outbound: Outbound[] } {
  requireOpen(sql)
  const current = Number(meta(sql, 'revision') ?? '0')
  if (input.revision !== current) throw new StaleRevision(current)
  const next = current + 1
  setMeta(sql, 'source', input.markdown)
  setMeta(sql, 'revision', String(next))
  if (input.title) setMeta(sql, 'title', input.title)
  touchPlan(sql)
  const view = planView(sql)
  return {
    revision: next,
    outbound: [
      {
        event: 'plan',
        data: {
          source: view.source,
          title: view.title,
          responses: view.responses,
          locked: false,
          snapshots: [],
          headSnapshotId: null,
        },
      },
    ],
  }
}

export function putBlob(sql: PlanSql, key: 'theme' | 'git', value: unknown): void {
  requireOpen(sql)
  setMeta(sql, key, JSON.stringify(value))
  touchPlan(sql)
}

export function submitInteraction(sql: PlanSql, interactionId: string, body: unknown): { outbound: Outbound[]; body: unknown } {
  requireOpen(sql)
  if (!body || typeof body !== 'object') throw new PlanRoomError(400, 'Missing interaction')
  const payload = body as { id?: string }
  if (payload.id !== interactionId) throw new PlanRoomError(400, 'Interaction id mismatch')
  const responses = jsonMeta<Record<string, unknown>>(sql, 'responses', {})
  responses[interactionId] = body
  setMeta(sql, 'responses', JSON.stringify(responses))
  const record = pushEvent(sql, 'interaction', body)
  touchPlan(sql)
  return { outbound: [{ event: 'notice', data: record }], body: { ok: true, response: body } }
}

export function submitComment(sql: PlanSql, body: unknown): { outbound: Outbound[]; body: unknown } {
  requireOpen(sql)
  const payload = (body ?? {}) as { partId?: unknown; text?: unknown; kind?: unknown; blockId?: unknown; excerpt?: unknown }
  const partId = String(payload.partId ?? '').trim()
  const text = String(payload.text ?? '').trim()
  if (!partId || !text) throw new PlanRoomError(400, 'Missing comment')
  const comment = {
    id: randomId('cmt_'),
    partId,
    kind: String(payload.kind ?? 'part').slice(0, 40) || 'part',
    blockId: String(payload.blockId ?? '').slice(0, 80) || undefined,
    excerpt: String(payload.excerpt ?? '').replace(/\s+/g, ' ').trim().slice(0, 180),
    text: text.slice(0, 4000),
    createdAt: Date.now(),
    addressingAt: null,
    addressedAt: null,
  }
  const comments = jsonMeta<unknown[]>(sql, 'comments', [])
  comments.push(comment)
  setMeta(sql, 'comments', JSON.stringify(comments))
  const record = pushEvent(sql, 'comment', comment)
  touchPlan(sql)
  return {
    outbound: [
      { event: 'notice', data: record },
      { event: 'comment', data: comment },
    ],
    body: { ok: true, comment },
  }
}

export function submitReview(sql: PlanSql, body: unknown): { outbound: Outbound[]; body: unknown } {
  requireOpen(sql)
  if ((meta(sql, 'mode') ?? 'watch') !== 'review') throw new PlanRoomError(400, 'Server is not in review mode')
  const payload = (body ?? {}) as { decision?: string; note?: string }
  if (payload.decision !== 'approve' && payload.decision !== 'deny' && payload.decision !== 'iterate') {
    throw new PlanRoomError(400, 'Invalid decision')
  }
  const review = {
    decision: payload.decision,
    note: payload.note,
    comments: [],
    responses: Object.values(jsonMeta<Record<string, unknown>>(sql, 'responses', {})),
    iteration: 1,
  }
  setMeta(sql, 'review', JSON.stringify(review))
  if (payload.decision === 'approve' || payload.decision === 'deny') setMeta(sql, 'mode', 'watch')
  const record = pushEvent(sql, 'review', review)
  touchPlan(sql)
  return {
    outbound: [
      { event: 'notice', data: record },
      { event: 'review', data: review },
    ],
    body: { ok: true, review },
  }
}

export function updateMode(sql: PlanSql, body: unknown): { outbound: Outbound[]; body: unknown } {
  requireOpen(sql)
  const mode = (body as { mode?: unknown } | null)?.mode
  if (mode !== 'watch' && mode !== 'comment' && mode !== 'review') throw new PlanRoomError(400, 'Invalid mode')
  setMeta(sql, 'mode', mode)
  if (mode === 'review') setMeta(sql, 'review', 'null')
  touchPlan(sql)
  const view = planView(sql)
  return { outbound: [{ event: 'mode', data: { mode, review: view.review } }], body: { ok: true, mode } }
}

export function putExecution(sql: PlanSql, body: unknown): { outbound: Outbound[]; body: unknown } {
  requireOpen(sql)
  setMeta(sql, 'execution', JSON.stringify(body ?? { active: false }))
  touchPlan(sql)
  return { outbound: [{ event: 'execution', data: body }], body: { ok: true, execution: body } }
}

export function ackEvents(sql: PlanSql, ids: string[]): { delivered: string[] } {
  const delivered: string[] = []
  const now = Date.now()
  for (const id of ids) {
    const row = sql.exec(`SELECT id, delivered_at FROM events WHERE id = ?`, id).toArray()[0]
    if (!row || row.delivered_at != null) continue
    sql.exec(`UPDATE events SET delivered_at = ? WHERE id = ?`, now, id)
    delivered.push(id)
  }
  return { delivered }
}

export function closePlan(sql: PlanSql): void {
  migratePlan(sql)
  setMeta(sql, 'closed', '1')
  setMeta(sql, 'last_seen', String(Date.now()))
}

export function addressComment(
  sql: PlanSql,
  commentId: string,
  body: unknown,
): { outbound: Outbound[]; body: unknown } {
  requireOpen(sql)
  const comments = jsonMeta<Array<Record<string, unknown>>>(sql, 'comments', [])
  const comment = comments.find((entry) => entry.id === commentId)
  if (!comment) throw new PlanRoomError(404, 'Comment not found')
  const outcome = (body as { outcome?: unknown } | null)?.outcome
  if (outcome != null && outcome !== 'implemented' && outcome !== 'errored' && outcome !== 'issues') {
    throw new PlanRoomError(400, 'Invalid outcome')
  }
  comment.addressedAt = Date.now()
  comment.addressingAt = null
  if (outcome) comment.outcome = outcome
  setMeta(sql, 'comments', JSON.stringify(comments))
  touchPlan(sql)
  return { outbound: [{ event: 'comment', data: comment }], body: { ok: true, comment } }
}

export function replyToComment(
  sql: PlanSql,
  commentId: string,
  body: unknown,
): { outbound: Outbound[]; body: unknown } {
  requireOpen(sql)
  const text = String((body as { text?: unknown } | null)?.text ?? '').trim()
  if (!text) throw new PlanRoomError(400, 'Missing reply')
  const comments = jsonMeta<Array<Record<string, unknown>>>(sql, 'comments', [])
  const comment = comments.find((entry) => entry.id === commentId)
  if (!comment) throw new PlanRoomError(404, 'Comment not found')
  const replies = Array.isArray(comment.replies) ? comment.replies : []
  replies.push({ id: randomId('reply_'), text: text.slice(0, 4000), createdAt: Date.now() })
  comment.replies = replies
  setMeta(sql, 'comments', JSON.stringify(comments))
  touchPlan(sql)
  return { outbound: [{ event: 'comment', data: comment }], body: { ok: true, comment } }
}

export function agentHello(sql: PlanSql): Outbound {
  const view = planView(sql)
  return {
    event: 'hello',
    data: {
      mode: view.mode,
      responses: view.responses,
      review: view.review,
      comments: view.comments,
      execution: view.execution,
      pending: pendingEvents(sql),
    },
  }
}

export function bearerMatches(sql: PlanSql, header: string | null): boolean {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '')
  if (!match?.[1]) return false
  try {
    return secretEquals(planToken(sql), match[1])
  } catch {
    return false
  }
}

export function actorAllows(
  actor: string | null,
  header: string | null,
  sql: PlanSql,
  action: 'read' | 'submit' | 'upload' | 'agent' | 'close',
): boolean {
  if (bearerMatches(sql, header) && allows('plan', action)) return true
  if (actor === 'account' || actor === 'viewer') return allows(actor, action)
  return false
}
