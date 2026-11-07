import { DurableObject } from 'cloudflare:workers'
import { Elysia } from 'elysia'
import { IDLE_MS } from './access'
import { AGENT_LEASE_REFRESH_MS, agentPresence, type AgentPresence } from '../agentPresence'
import { rehydrateRequest } from './rehydrateRequest'
import { hostedSearch } from './hostedSearch'
import {
  ackEvents,
  actorAllows,
  agentHello,
  agentSeenAt,
  closePlan,
  markAgentSeen,
  planIdOf,
  rememberPlanId,
  executionView,
  initPlan,
  migratePlan,
  planHosted,
  planProgress,
  pendingEvents,
  planTier,
  planView,
  PlanRoomError,
  putBlob,
  commitUserMutation,
  planSnapshot,
  putExecution,
  putSource,
  socketLimit,
  StaleRevision,
  submitComment,
  submitInteraction,
  submitReview,
  addressComment,
  browserHello,
  changeExecution,
  executionActive,
  liveExecution,
  markCommentAddressing,
  replyToComment,
  touchPlan,
  updateMode,
  type Outbound,
  type PlanSql,
} from './planRoom'
import type { UserMutationKind } from '../offlineSync'
import type { ExecutionAction } from '../execution'

/** Socket tags. An agent socket is a CLI command waiting on the plan. A page socket reads it. */
const AGENT_TAG = 'agent'
const PAGE_TAG = 'read'
const OPEN = 1

/** A page sends this on its socket to check the line. The object answers without waking. */
export const SOCKET_PING = 'ping'
export const SOCKET_PONG = 'pong'

type SqlExec = {
  exec(query: string, ...bindings: unknown[]): { toArray(): Array<Record<string, unknown>> }
}

export class PlanObject extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never)
    // A new room, such as one on a Worker Preview, has no tables until something creates them.
    migratePlan(this.sql())
    // Answered by the runtime, so a page can tell a live socket from a dead one without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(SOCKET_PING, SOCKET_PONG))
  }

  private sql(): PlanSql {
    return this.ctx.storage.sql as unknown as SqlExec
  }

  private publish(outbound: Outbound[]): void {
    const payload = outbound.map((item) => JSON.stringify(item))
    for (const socket of this.ctx.getWebSockets()) {
      for (const item of payload) {
        try {
          socket.send(item)
        } catch {
          // A socket can close between the list and the send.
        }
      }
    }
  }

  /** Open agent sockets. A socket that is closing can still be listed while its close runs. */
  private agentSockets(except?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets(AGENT_TAG).filter((socket) => socket !== except && socket.readyState === OPEN)
  }

  private presence(except?: WebSocket): AgentPresence {
    return agentPresence(this.agentSockets(except).length, agentSeenAt(this.sql()))
  }

  /** Sent to pages only. An agent socket does not need to hear about itself. */
  private publishPages(outbound: Outbound[]): void {
    const payload = outbound.map((item) => JSON.stringify(item))
    for (const socket of this.ctx.getWebSockets()) {
      if (this.ctx.getTags(socket).includes(AGENT_TAG)) continue
      for (const item of payload) {
        try {
          socket.send(item)
        } catch {
          // A socket can close between the list and the send.
        }
      }
    }
  }

  /**
   * Save presence on the plan's dashboard row. `agentCheckedAt` is the lease the dashboard reads,
   * renewed by the alarm while an agent stays connected. Best effort: a failed write leaves the
   * lease to run out.
   */
  private async savePresence(presence: AgentPresence): Promise<void> {
    const id = planIdOf(this.sql())
    const db = (this.env as unknown as { DB?: D1Database }).DB
    if (!id || !db) return
    try {
      await db
        .prepare(
          `UPDATE plans SET meta = json_set(COALESCE(meta, '{}'), '$.agentConnected', json(?), '$.agentSeenAt', ?, '$.agentCheckedAt', ?) WHERE id = ?`,
        )
        .bind(presence.connected ? 'true' : 'false', presence.seenAt, Date.now(), id)
        .run()
    } catch {
      // The lease runs out on its own.
    }
  }

  /** An agent socket opened or closed. Pages hear it at once, and the dashboard row follows. */
  private async agentsChanged(except?: WebSocket): Promise<void> {
    markAgentSeen(this.sql(), Date.now())
    const presence = this.presence(except)
    this.publishPages([{ event: 'agent', data: presence }])
    await this.savePresence(presence)
    await this.armAlarm(except)
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    try {
      socket.close(code, reason)
    } catch {
      // Already closed.
    }
    if (this.ctx.getTags(socket).includes(AGENT_TAG)) await this.agentsChanged(socket)
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    if (this.ctx.getTags(socket).includes(AGENT_TAG)) await this.agentsChanged(socket)
  }

  /** While an agent is connected the alarm comes back sooner, to renew the dashboard lease. */
  private async armAlarm(except?: WebSocket): Promise<void> {
    const tier = planTier(this.sql())
    const wait = this.agentSockets(except).length > 0 ? Math.min(AGENT_LEASE_REFRESH_MS, IDLE_MS[tier]) : IDLE_MS[tier]
    await this.ctx.storage.setAlarm(Date.now() + wait)
  }

  async alarm(): Promise<void> {
    const sql = this.sql()
    migratePlan(sql)
    if (this.agentSockets().length > 0) {
      await this.savePresence(this.presence())
      await this.armAlarm()
      return
    }
    if (this.ctx.getWebSockets().length > 0) {
      await this.armAlarm()
      return
    }
    const row = sql.exec(`SELECT value FROM meta WHERE key = ?`, 'last_seen').toArray()[0]
    const last = Number(row?.value ?? 0)
    const idle = IDLE_MS[planTier(sql)]
    if (Date.now() - last >= idle) closePlan(sql)
    else await this.ctx.storage.setAlarm(last + idle)
  }

  async fetch(request: Request): Promise<Response> {
    // An object that was never registered has no tables. Create them before any route reads one.
    migratePlan(this.sql())
    rememberPlanId(this.sql(), request.headers.get('x-living-plan-id'))
    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') return this.acceptSocket(request)
    return this.httpApp().fetch(request)
  }

  private async acceptSocket(request: Request): Promise<Response> {
    const sql = this.sql()
    const url = new URL(request.url)
    const actor = request.headers.get('x-living-plan-actor')
    const authorization = request.headers.get('authorization')
    const action = url.pathname.endsWith('/api/agent-events') ? 'agent' : 'read'
    if (!actorAllows(actor, authorization, sql, action)) return text(401, 'Sign in required')
    if (!planHosted(sql)) return text(404, 'Plan not found on this host.')
    if (this.ctx.getWebSockets().length >= socketLimit(sql)) {
      return text(403, `This plan is at its ${planTier(sql)} connection limit (${socketLimit(sql)}).`)
    }
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1], [action === 'agent' ? AGENT_TAG : PAGE_TAG])
    touchPlan(sql)
    // Sent before anything else can run, so a write after it reaches this socket as its own event.
    if (action === 'agent') {
      pair[1].send(JSON.stringify(agentHello(sql)))
      await this.agentsChanged()
    }
    // A page that reconnects catches up on the run, the mode, the review, and the agent it missed.
    else pair[1].send(JSON.stringify(browserHello(sql, this.presence())))
    await this.armAlarm()
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  private httpApp() {
    const sql = this.sql()
    const actorOf = (request: Request) => request.headers.get('x-living-plan-actor')
    const authorizationOf = (request: Request) => request.headers.get('authorization')
    // Ahead-of-time compilation is off because Workers reject `new Function`.
    return new Elysia({ strictPath: true, aot: false })
      .onBeforeHandle((context) => {
        rehydrateRequest(context)
      })
      .onError(({ code, error }) => {
        // A route this object does not serve is 404, not a server error.
        if (code === 'NOT_FOUND') return text(404, 'Not found')
        if (error instanceof StaleRevision) return Response.json({ revision: error.revision }, { status: 409 })
        if (error instanceof PlanRoomError) return text(error.status, error.message)
        return text(500, error instanceof Error ? error.message : 'Unknown error')
      })
      .post('/internal/init', async ({ request }) => {
        const body = (await request.json()) as { token: string; title: string; mode: string; tier: string; source: string }
        const result = initPlan(sql, body)
        await this.armAlarm()
        return Response.json(result)
      })
      // Called by the Worker after a write, to keep the dashboard row current. /internal/ is not reachable from outside.
      .get('/internal/progress', async () => Response.json({ progress: planHosted(sql) ? await planProgress(sql) : null }))
      .delete('/', ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'close')) return text(401, 'Sign in required')
        closePlan(sql)
        for (const socket of this.ctx.getWebSockets()) {
          try {
            socket.close(1000, 'closed')
          } catch {
            // Already gone.
          }
        }
        return Response.json({ ok: true })
      })
      .get('/view', ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'read')) return text(401, 'Sign in required')
        if (!planHosted(sql)) return text(404, 'Plan not found on this host.')
        touchPlan(sql)
        return Response.json(planView(sql))
      })
      .put('/source', async ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'upload')) return text(401, 'Sign in required')
        const body = (await request.json()) as { markdown?: string; revision?: number; title?: string }
        const result = putSource(sql, {
          markdown: String(body.markdown ?? ''),
          revision: Number(body.revision ?? -1),
          title: body.title,
        })
        // A phase marked done in the file moves its workflow step, and the page's status with it.
        this.publish([...result.outbound, { event: 'execution', data: await liveExecution(sql) }])
        await this.armAlarm()
        return Response.json({ revision: result.revision })
      })
      .put('/theme', ({ request }) => this.putNamedBlob(request, sql, 'theme'))
      .put('/git', ({ request }) => this.putNamedBlob(request, sql, 'git'))
      .post('/api/agent-events/ack', async ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'agent')) return text(401, 'Sign in required')
        const body = (await request.json()) as { ids?: string[] }
        return Response.json({ ok: true, ...ackEvents(sql, body.ids ?? []) })
      })
      .post('/api/interactions/:id', async ({ request, params }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'submit')) return text(401, 'Sign in required')
        const response = await this.userWrite(request, sql, 'interaction', (body) => submitInteraction(sql, params.id, body))
        // An answered step is done on the workflow too.
        if (response.ok) this.publish([{ event: 'execution', data: await liveExecution(sql) }])
        return response
      })
      .post('/api/comments', async ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'submit')) return text(401, 'Sign in required')
        return this.userWrite(request, sql, 'comment', (body) => submitComment(sql, body))
      })
      .post('/api/comments/:id/reply', ({ request, params }) => this.commentAction(request, sql, params.id, 'reply'))
      .post('/api/comments/:id/address', ({ request, params }) => this.commentAction(request, sql, params.id, 'address'))
      .post('/api/comments/:id/addressing', ({ request, params }) => this.commentAction(request, sql, params.id, 'addressing'))
      .post('/api/review', async ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'submit')) return text(401, 'Sign in required')
        return this.userWrite(request, sql, 'review', (body) => submitReview(sql, body))
      })
      .post('/api/mode', async ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'upload') && !actorAllows(actorOf(request), authorizationOf(request), sql, 'submit')) {
          return text(401, 'Sign in required')
        }
        return this.userWrite(request, sql, 'mode', (body) => updateMode(sql, body))
      })
      .put('/api/execution', async ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'upload')) return text(401, 'Sign in required')
        return this.publishExecution(putExecution(sql, await request.json()))
      })
      .post('/api/execution/:action', async ({ request, params }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'upload')) return text(401, 'Sign in required')
        const action = params.action as ExecutionAction
        if (action !== 'start' && action !== 'push' && action !== 'stop') return text(404, 'Not found')
        return this.publishExecution(changeExecution(sql, action, await readJson(request)))
      })
      .get('/api/execution', async ({ request }) => {
        // The agent reads the run with its plan bearer, the page with the account.
        const actor = actorOf(request)
        const authorization = authorizationOf(request)
        if (!actorAllows(actor, authorization, sql, 'read') && !actorAllows(actor, authorization, sql, 'upload')) {
          return text(401, 'Sign in required')
        }
        touchPlan(sql)
        return Response.json(await executionView(sql))
      })
      .get('/api/snapshot', ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'read')) return text(401, 'Sign in required')
        touchPlan(sql)
        return Response.json(planSnapshot(sql))
      })
      .get('/api/plan-mdx', ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'read')) return text(401, 'Sign in required')
        const view = planView(sql)
        return Response.json({
          source: view.source,
          title: view.title,
          responses: view.responses,
          locked: executionActive(view),
          snapshots: [],
          headSnapshotId: null,
        })
      })
      .get('/api/search', ({ request }) =>
        hostedSearch({
          sql,
          db: (this.env as unknown as { DB?: D1Database }).DB,
          actor: actorOf(request),
          authorization: authorizationOf(request),
          url: new URL(request.url),
        }),
      )
      .get('/api/events', ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'read')) return text(401, 'Sign in required')
        return Response.json({ pending: pendingEvents(sql) })
      })
  }

  /** Browsers get the run with the plan's workflow, the shape GET /api/execution returns. */
  private async publishExecution(result: { outbound: Outbound[]; body: unknown }): Promise<Response> {
    const sql = this.sql()
    const view = await liveExecution(sql)
    this.publish([{ event: 'execution', data: view }, ...result.outbound.filter((item) => item.event !== 'execution')])
    await this.armAlarm()
    return Response.json({ ok: true, execution: view })
  }

  private async putNamedBlob(request: Request, sql: PlanSql, key: 'theme' | 'git'): Promise<Response> {
    if (!actorAllows(request.headers.get('x-living-plan-actor'), request.headers.get('authorization'), sql, 'upload')) {
      return text(401, 'Sign in required')
    }
    putBlob(sql, key, await request.json())
    await this.armAlarm()
    return Response.json({ ok: true })
  }

  private async userWrite(
    request: Request,
    sql: PlanSql,
    kind: UserMutationKind,
    apply: (body: unknown) => { outbound: Outbound[]; body: unknown },
  ): Promise<Response> {
    const body = await readJson(request)
    const result = commitUserMutation(sql, { kind, key: idempotencyKey(request), body }, apply)
    this.publish(result.outbound)
    return Response.json(result.body, { status: result.status })
  }

  private async commentAction(request: Request, sql: PlanSql, commentId: string, action: string): Promise<Response> {
    if (
      !actorAllows(request.headers.get('x-living-plan-actor'), request.headers.get('authorization'), sql, 'submit') &&
      !actorAllows(request.headers.get('x-living-plan-actor'), request.headers.get('authorization'), sql, 'upload')
    ) {
      return text(401, 'Sign in required')
    }
    const kind: UserMutationKind = action === 'reply' ? 'reply' : action === 'address' ? 'address' : 'addressing'
    return this.userWrite(request, sql, kind, (body) =>
      action === 'reply'
        ? replyToComment(sql, commentId, body)
        : action === 'address'
          ? addressComment(sql, commentId, body)
          : markCommentAddressing(sql, commentId),
    )
  }
}

async function readJson(request: Request): Promise<unknown> {
  const textBody = await request.text()
  if (!textBody.trim()) return {}
  try {
    return JSON.parse(textBody) as unknown
  } catch {
    return {}
  }
}

function idempotencyKey(request: Request): string | null {
  const key = request.headers.get('idempotency-key')?.trim()
  return key || null
}

function text(status: number, message: string): Response {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
