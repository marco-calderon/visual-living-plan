import type { AgentPresence } from '../agentPresence'
import { applyExecutionChange, readExecutionPatch, type ExecutionAction, type ExecutionState, type RunFollow } from '../execution'
import { approvesRun, nextRunState } from '../runFollow'
import type { InteractionResponse } from '../types'
import type { PlanProgress } from '../planProgress'
import { INVALID_ITERATION, readIteration, UNREAD_VERDICT } from '../reviewRound'
import {
  inspectMutation,
  readBaseRevision,
  rememberMutation,
  type IdempotencyRecord,
  type PlanSnapshot,
  type UserMutationKind,
} from '../offlineSync'
import { allows, normalizeTier, SOCKET_CAPS, type PlanAction, type Tier } from './access'

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
  constructor(
    readonly revision: number,
    /** The revisions the upload missed include an edit a person published from the page. */
    readonly pageEdit = false,
  ) {
    super(409, pageEdit ? 'A person edited this plan on the page. Pull their version before uploading.' : 'Stale revision')
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
  input: { token: string; title: string; mode: string; tier: string; source: string; iteration?: number },
): { revision: number; outbound: Outbound[] } {
  migratePlan(sql)
  const existing = meta(sql, 'token')
  if (existing) {
    if (!secretEquals(existing, input.token)) throw new PlanRoomError(409, 'This plan is already hosted.')
    setMeta(sql, 'closed', '0')
    setMeta(sql, 'title', input.title)
    const before = `${meta(sql, 'mode') ?? 'watch'}:${planIteration(sql)}`
    // `review --cloud` starts a new round: the last verdict is cleared, unless the agent never received it.
    if (input.mode === 'review') enterReview(sql, input.iteration)
    else setMeta(sql, 'mode', input.mode)
    setMeta(sql, 'tier', normalizeTier(input.tier))
    setMeta(sql, 'last_seen', String(Date.now()))
    const after = `${meta(sql, 'mode') ?? 'watch'}:${planIteration(sql)}`
    return { revision: Number(meta(sql, 'revision') ?? '0'), outbound: after === before ? [] : [modeOutbound(sql)] }
  }
  setMeta(sql, 'token', input.token)
  setMeta(sql, 'title', input.title)
  setMeta(sql, 'mode', input.mode)
  setMeta(sql, 'iteration', String(input.iteration ?? 1))
  setMeta(sql, 'tier', normalizeTier(input.tier))
  setMeta(sql, 'source', input.source)
  setMeta(sql, 'revision', '0')
  setMeta(sql, 'responses', '{}')
  setMeta(sql, 'comments', '[]')
  setMeta(sql, 'review', 'null')
  setMeta(sql, 'execution', JSON.stringify({ active: false }))
  setMeta(sql, 'closed', '0')
  setMeta(sql, 'last_seen', String(Date.now()))
  return { revision: 0, outbound: [] }
}

/** The review round. A plan hosted before rounds were stored is on round 1. */
export function planIteration(sql: PlanSql): number {
  const stored = Number(meta(sql, 'iteration') ?? '1')
  return Number.isInteger(stored) && stored >= 1 ? stored : 1
}

/** The person sent a verdict and no agent has acked its `review` row yet. */
export function verdictUnread(sql: PlanSql): boolean {
  const review = jsonMeta<{ decision?: string } | null>(sql, 'review', null)
  if (!review?.decision) return false
  return sql.exec(`SELECT id FROM events WHERE event = 'review' AND delivered_at IS NULL LIMIT 1`).toArray().length > 0
}

/** Start a review round and clear the last verdict, unless it is still unread. Returns false when it kept it. */
function enterReview(sql: PlanSql, iteration?: number): boolean {
  if (verdictUnread(sql)) return false
  setMeta(sql, 'mode', 'review')
  setMeta(sql, 'review', 'null')
  if (iteration !== undefined) setMeta(sql, 'iteration', String(iteration))
  return true
}

function modeOutbound(sql: PlanSql): Outbound {
  const view = planView(sql)
  return { event: 'mode', data: { mode: view.mode, iteration: planIteration(sql), review: view.review } }
}

export function planToken(sql: PlanSql): string {
  migratePlan(sql)
  const token = meta(sql, 'token')
  if (!token) throw new PlanRoomError(404, 'Plan not found')
  return token
}

/** False for an object that was never registered, such as a production plan opened on a Worker Preview. */
export function planHosted(sql: PlanSql): boolean {
  migratePlan(sql)
  return meta(sql, 'token') !== null
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
  // An unchanged file keeps its revision. Otherwise every reconnecting CLI would make open pages stale.
  // It also tells a watcher that wrote a pulled page edit back the revision it missed.
  if (input.markdown === meta(sql, 'source') && (!input.title || input.title === meta(sql, 'title'))) {
    touchPlan(sql)
    return { revision: current, outbound: [] }
  }
  if (input.revision !== current) {
    // An upload that never saw a page edit would overwrite it. The agent pulls it first.
    throw new StaleRevision(current, input.revision < Number(meta(sql, 'page_revision') ?? '0'))
  }
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
          // The page sends this revision with its next answer, so it must hear the new one.
          revision: next,
          // An edit during a run must not unlock the page's forms.
          locked: executionActive(view),
          snapshots: [],
          headSnapshotId: null,
        },
      },
    ],
  }
}

/**
 * The owner saved the plan from the page editor. `base` is the source the editor started from;
 * a plan that changed since then is refused, so neither edit is lost. The agent hears an `edit`
 * with the new source, which `live-plan events` writes into the local plan file.
 */
export function editSource(
  sql: PlanSql,
  input: { base: string; source: string; title?: string },
): { revision: number; outbound: Outbound[] } {
  requireOpen(sql)
  const current = Number(meta(sql, 'revision') ?? '0')
  if (executionActive(planView(sql))) throw new PlanRoomError(409, 'The plan cannot be edited while execution is live')
  if (input.base !== (meta(sql, 'source') ?? '')) {
    throw new PlanRoomError(409, 'The plan changed while you were editing. Reload to see the new version.')
  }
  if (!input.source.trim()) throw new PlanRoomError(400, 'The plan is empty.')
  if (input.source === input.base) return { revision: current, outbound: [] }
  const next = current + 1
  setMeta(sql, 'source', input.source)
  setMeta(sql, 'revision', String(next))
  setMeta(sql, 'page_revision', String(next))
  if (input.title) setMeta(sql, 'title', input.title)
  touchPlan(sql)
  const view = planView(sql)
  const record = pushEvent(sql, 'edit', { at: Date.now(), by: 'page', title: view.title, revision: next, source: input.source })
  return {
    revision: next,
    outbound: [
      { event: 'notice', data: record },
      {
        event: 'plan',
        data: {
          source: view.source,
          title: view.title,
          responses: view.responses,
          revision: next,
          locked: executionActive(view),
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
  // An approve gate answered yes lets the agent's next upload of the plan file start the run.
  if (approvesRun({ response: body as InteractionResponse })) armRun(sql)
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
  const blockId = String(payload.blockId ?? '').slice(0, 80)
  const comment = {
    id: randomId('cmt_'),
    partId,
    kind: String(payload.kind ?? 'part').slice(0, 40) || 'part',
    ...(blockId ? { blockId } : {}),
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
    iteration: planIteration(sql),
  }
  setMeta(sql, 'review', JSON.stringify(review))
  if (payload.decision === 'approve' || payload.decision === 'deny') setMeta(sql, 'mode', 'watch')
  // From here the run follows the plan file: the agent's next upload with a phase past pending starts it.
  if (approvesRun({ decision: payload.decision })) armRun(sql)
  const record = pushEvent(sql, 'review', review)
  touchPlan(sql)
  return {
    outbound: [
      { event: 'notice', data: record },
      { event: 'review', data: review },
      // Approve and deny move the plan to watch. A listener that stays running prints that move.
      modeOutbound(sql),
    ],
    body: { ok: true, review },
  }
}

export function updateMode(sql: PlanSql, body: unknown): { outbound: Outbound[]; body: unknown } {
  requireOpen(sql)
  const payload = (body ?? {}) as { mode?: unknown; iteration?: unknown }
  const mode = payload.mode
  if (mode !== 'watch' && mode !== 'comment' && mode !== 'review') throw new PlanRoomError(400, 'Invalid mode')
  const iteration = readIteration(payload.iteration)
  if (iteration === 'invalid') throw new PlanRoomError(400, INVALID_ITERATION)
  if (mode === 'review') {
    if (!enterReview(sql, iteration)) throw new PlanRoomError(409, UNREAD_VERDICT)
  } else {
    setMeta(sql, 'mode', mode)
    if (iteration !== undefined) setMeta(sql, 'iteration', String(iteration))
  }
  touchPlan(sql)
  return { outbound: [modeOutbound(sql)], body: { ok: true, mode, iteration: planIteration(sql) } }
}

export function putExecution(sql: PlanSql, body: unknown): { outbound: Outbound[]; body: unknown } {
  requireOpen(sql)
  const previous = jsonMeta<{ active?: boolean; follow?: RunFollow }>(sql, 'execution', { active: false })
  const given = (body ?? { active: false }) as { active?: boolean; follow?: RunFollow }
  // A body that leaves `follow` out keeps it, except that stopping a live run is the agent's call.
  const follow = 'follow' in given ? given.follow : previous.active && !given.active ? 'off' : previous.follow
  const next = { ...given, ...(follow ? { follow } : {}) }
  setMeta(sql, 'execution', JSON.stringify(next))
  const revision = Boolean(previous.active) !== Boolean(next.active) ? bumpRevision(sql) : Number(meta(sql, 'revision') ?? '0')
  touchPlan(sql)
  return { outbound: [{ event: 'execution', data: { ...next, revision } }], body: { ok: true, execution: body } }
}

/** An agent's `execution start`, `push`, or `stop`. Fields left out keep their stored value. */
export function changeExecution(sql: PlanSql, action: ExecutionAction, body: unknown): { outbound: Outbound[]; body: unknown } {
  const current = { active: false, ...(planView(sql).execution as Partial<ExecutionState> | null) } as ExecutionState
  return putExecution(sql, applyExecutionChange(current, action, readExecutionPatch(body)))
}

/** An approval arms the run to follow the plan file (`runFollow.ts`). */
function armRun(sql: PlanSql): void {
  const execution = jsonMeta<Record<string, unknown>>(sql, 'execution', { active: false })
  setMeta(sql, 'execution', JSON.stringify({ ...execution, follow: 'armed' }))
}

/**
 * Start or end the run the way the plan file says (`runFollow.ts`). Every step done or one failed
 * ends it. Only a new plan source (`mayStart`) can start it, after an approval. Returns true when the
 * run changed.
 */
export async function settleRun(sql: PlanSql, mayStart = false): Promise<boolean> {
  if (planView(sql).closed) return false
  const change = nextRunState(await executionView(sql), { mayStart })
  if (!change) return false
  const stored = { active: false, ...(jsonMeta<Partial<ExecutionState> | null>(sql, 'execution', null) ?? {}) }
  putExecution(sql, { ...stored, active: change.active, step: stored.step ?? (change.active ? 'Executing' : undefined) })
  return true
}

export function executionActive(view: Pick<PlanView, 'execution'>): boolean {
  return Boolean((view.execution as { active?: boolean } | null)?.active)
}

/**
 * The first frame a page's socket gets: the state it needs to show, so a reconnect catches up on
 * what it missed. It is read without awaiting, so no write lands between the read and the send.
 * The run carries no expected workflow. The Workflow tab reads that from GET /api/execution.
 */
export function browserHello(sql: PlanSql, agent?: AgentPresence): Outbound {
  const view = planView(sql)
  return {
    event: 'hello',
    data: {
      mode: view.mode,
      review: view.review,
      execution: { active: false, ...(view.execution as Partial<ExecutionState> | null) },
      ...(agent ? { agent } : {}),
    },
  }
}

const PLAN_ID = /^[A-Za-z0-9_-]{8,80}$/

/** The Worker names the plan on each request it forwards. Saved so the object can update its dashboard row. */
export function rememberPlanId(sql: PlanSql, id: string | null): void {
  if (!id || !PLAN_ID.test(id) || meta(sql, 'plan_id') === id) return
  setMeta(sql, 'plan_id', id)
}

export function planIdOf(sql: PlanSql): string | null {
  return meta(sql, 'plan_id')
}

/** When an agent socket last opened or closed. */
export function agentSeenAt(sql: PlanSql): number | null {
  const value = Number(meta(sql, 'agent_seen') ?? 0)
  return value > 0 ? value : null
}

export function markAgentSeen(sql: PlanSql, at: number): void {
  setMeta(sql, 'agent_seen', String(at))
}

/** Execution state for the Workflow tab, with the expected workflow from the current source, as the local session returns it. */
export async function executionView(sql: PlanSql): Promise<ExecutionState> {
  const view = planView(sql)
  const execution = { active: false, ...(view.execution as Partial<ExecutionState> | null) } as ExecutionState
  try {
    // Loaded on first use. A top-level import of the parser stops the Worker from starting.
    // Not ../workflow: its layout loads ELK, which a Worker cannot run. The page lays the graph out.
    const [{ parsePlan }, { buildExpectedGraph }] = await Promise.all([import('../parse'), import('../expectedWorkflow')])
    return { ...execution, planned: buildExpectedGraph(parsePlan(view.source), undefined, Object.keys(view.responses)) }
  } catch {
    // A source that does not parse still has a run state to show.
    return execution
  }
}

/** The run as pages hear it: with the plan revision, which a start or stop moves. */
export async function liveExecution(sql: PlanSql): Promise<ExecutionState & { revision: number }> {
  return { ...(await executionView(sql)), revision: planView(sql).revision }
}

/** Progress of the hosted plan, measured the way the local session measures it. Null when the source does not parse. */
export async function planProgress(sql: PlanSql): Promise<PlanProgress | null> {
  const view = planView(sql)
  const execution = { active: false, ...(view.execution as Partial<ExecutionState> | null) } as ExecutionState
  try {
    // Loaded on first use, like the parser in executionView.
    const [{ parsePlan }, { measurePlan }] = await Promise.all([import('../parse'), import('../planProgress')])
    return measurePlan(parsePlan(view.source), Object.keys(view.responses), execution)
  } catch {
    return null
  }
}

export function planSnapshot(sql: PlanSql): PlanSnapshot {
  const view = planView(sql)
  const execution = view.execution as { active?: boolean } | null
  return {
    revision: view.revision,
    source: view.source,
    title: view.title,
    mode: view.mode,
    responses: view.responses,
    comments: view.comments,
    review: view.review,
    locked: Boolean(execution?.active),
  }
}

export function commitUserMutation(
  sql: PlanSql,
  input: { kind: UserMutationKind; key: string | null; body: unknown },
  apply: (body: unknown) => { outbound: Outbound[]; body: unknown },
): { status: number; body: unknown; outbound: Outbound[] } {
  requireOpen(sql)
  const view = planView(sql)
  const execution = view.execution as { active?: boolean } | null
  const decision = inspectMutation({
    kind: input.kind,
    key: input.key,
    body: input.body,
    baseRevision: readBaseRevision(input.body),
    currentRevision: view.revision,
    executionActive: Boolean(execution?.active),
    source: view.source,
    records: readMutations(sql),
  })
  if (decision.action === 'replay') return { status: 200, body: decision.result, outbound: [] }
  if (decision.action === 'reject') {
    return { status: 409, body: { error: decision.message, revision: view.revision }, outbound: [] }
  }
  const result = apply(decision.body)
  if (decision.key) writeMutations(sql, rememberMutation(readMutations(sql), decision.key, decision.body, result.body))
  touchPlan(sql)
  return { status: 200, body: result.body, outbound: result.outbound }
}

function bumpRevision(sql: PlanSql): number {
  const next = Number(meta(sql, 'revision') ?? '0') + 1
  setMeta(sql, 'revision', String(next))
  return next
}

function readMutations(sql: PlanSql): IdempotencyRecord[] {
  const stored = jsonMeta<IdempotencyRecord[]>(sql, 'idempotency', [])
  return Array.isArray(stored) ? stored : []
}

function writeMutations(sql: PlanSql, records: IdempotencyRecord[]): void {
  setMeta(sql, 'idempotency', JSON.stringify(records))
}

/**
 * Mark rows delivered. A comment the agent just received is shown in progress on the page, as the
 * local session does, so the agent does not have to call `addressing` first.
 */
export function ackEvents(sql: PlanSql, ids: string[]): { delivered: string[]; outbound: Outbound[] } {
  const delivered: string[] = []
  const received: string[] = []
  const now = Date.now()
  for (const id of ids) {
    const row = sql.exec(`SELECT id, event, data, delivered_at FROM events WHERE id = ?`, id).toArray()[0]
    if (!row || row.delivered_at != null) continue
    sql.exec(`UPDATE events SET delivered_at = ? WHERE id = ?`, now, id)
    delivered.push(id)
    if (row.event !== 'comment') continue
    try {
      const commentId = (JSON.parse(String(row.data ?? 'null')) as { id?: unknown } | null)?.id
      if (typeof commentId === 'string') received.push(commentId)
    } catch {
      // A row with unreadable data has no comment to mark.
    }
  }
  const outbound: Outbound[] = []
  if (received.length > 0) {
    const comments = jsonMeta<Array<Record<string, unknown>>>(sql, 'comments', [])
    for (const comment of comments) {
      if (!received.includes(String(comment.id)) || comment.addressedAt || comment.addressingAt) continue
      comment.addressingAt = now
      outbound.push({ event: 'comment', data: comment })
    }
    if (outbound.length > 0) setMeta(sql, 'comments', JSON.stringify(comments))
  }
  return { delivered, outbound }
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

/** The agent started on a comment. The page shows Addressing until `address` resolves it. */
export function markCommentAddressing(sql: PlanSql, commentId: string): { outbound: Outbound[]; body: unknown } {
  requireOpen(sql)
  const comments = jsonMeta<Array<Record<string, unknown>>>(sql, 'comments', [])
  const comment = comments.find((entry) => entry.id === commentId)
  if (!comment) throw new PlanRoomError(404, 'Comment not found')
  comment.addressingAt = Date.now()
  comment.addressedAt = null
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
      iteration: planIteration(sql),
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
  action: PlanAction,
): boolean {
  if (bearerMatches(sql, header) && allows('plan', action)) return true
  if (actor === 'account' || actor === 'viewer') return allows(actor, action)
  return false
}
