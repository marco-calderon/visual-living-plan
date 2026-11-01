import { DurableObject } from 'cloudflare:workers'
import { Elysia } from 'elysia'
import { IDLE_MS } from './access'
import {
  ackEvents,
  actorAllows,
  agentHello,
  closePlan,
  initPlan,
  migratePlan,
  pendingEvents,
  planTier,
  planView,
  PlanRoomError,
  putBlob,
  putExecution,
  putSource,
  socketLimit,
  StaleRevision,
  submitComment,
  submitInteraction,
  submitReview,
  addressComment,
  replyToComment,
  touchPlan,
  updateMode,
  type Outbound,
  type PlanSql,
} from './planRoom'

type SqlExec = {
  exec(query: string, ...bindings: unknown[]): { toArray(): Array<Record<string, unknown>> }
}

export class PlanObject extends DurableObject {
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

  private async armAlarm(): Promise<void> {
    const tier = planTier(this.sql())
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS[tier])
  }

  async alarm(): Promise<void> {
    const sql = this.sql()
    migratePlan(sql)
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
    if (this.ctx.getWebSockets().length >= socketLimit(sql)) {
      return text(403, `This plan is at its ${planTier(sql)} connection limit (${socketLimit(sql)}).`)
    }
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    touchPlan(sql)
    if (action === 'agent') pair[1].send(JSON.stringify(agentHello(sql)))
    await this.armAlarm()
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  private httpApp() {
    const sql = this.sql()
    const actorOf = (request: Request) => request.headers.get('x-living-plan-actor')
    const authorizationOf = (request: Request) => request.headers.get('authorization')
    return new Elysia({ strictPath: true })
      .onError(({ error }) => {
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
        this.publish(result.outbound)
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
        const result = submitInteraction(sql, params.id, await request.json())
        this.publish(result.outbound)
        return Response.json(result.body)
      })
      .post('/api/comments', async ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'submit')) return text(401, 'Sign in required')
        const result = submitComment(sql, await request.json())
        this.publish(result.outbound)
        return Response.json(result.body)
      })
      .post('/api/comments/:id/reply', ({ request, params }) => this.commentAction(request, sql, params.id, 'reply'))
      .post('/api/comments/:id/address', ({ request, params }) => this.commentAction(request, sql, params.id, 'address'))
      .post('/api/comments/:id/addressing', ({ request, params }) => this.commentAction(request, sql, params.id, 'addressing'))
      .post('/api/review', async ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'submit')) return text(401, 'Sign in required')
        const result = submitReview(sql, await request.json())
        this.publish(result.outbound)
        return Response.json(result.body)
      })
      .post('/api/mode', async ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'upload') && !actorAllows(actorOf(request), authorizationOf(request), sql, 'submit')) {
          return text(401, 'Sign in required')
        }
        const result = updateMode(sql, await request.json())
        this.publish(result.outbound)
        return Response.json(result.body)
      })
      .put('/api/execution', async ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'upload')) return text(401, 'Sign in required')
        const result = putExecution(sql, await request.json())
        this.publish(result.outbound)
        return Response.json(result.body)
      })
      .get('/api/plan-mdx', ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'read')) return text(401, 'Sign in required')
        const view = planView(sql)
        return Response.json({
          source: view.source,
          title: view.title,
          responses: view.responses,
          locked: false,
          snapshots: [],
          headSnapshotId: null,
        })
      })
      .get('/api/events', ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'read')) return text(401, 'Sign in required')
        return Response.json({ pending: pendingEvents(sql) })
      })
  }

  private async putNamedBlob(request: Request, sql: PlanSql, key: 'theme' | 'git'): Promise<Response> {
    if (!actorAllows(request.headers.get('x-living-plan-actor'), request.headers.get('authorization'), sql, 'upload')) {
      return text(401, 'Sign in required')
    }
    putBlob(sql, key, await request.json())
    await this.armAlarm()
    return Response.json({ ok: true })
  }

  private async commentAction(request: Request, sql: PlanSql, commentId: string, action: string): Promise<Response> {
    if (
      !actorAllows(request.headers.get('x-living-plan-actor'), request.headers.get('authorization'), sql, 'submit') &&
      !actorAllows(request.headers.get('x-living-plan-actor'), request.headers.get('authorization'), sql, 'upload')
    ) {
      return text(401, 'Sign in required')
    }
    const result =
      action === 'reply'
        ? replyToComment(sql, commentId, await request.json())
        : addressComment(sql, commentId, action === 'address' ? await request.json() : {})
    this.publish(result.outbound)
    return Response.json(result.body)
  }
}

function text(status: number, message: string): Response {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
