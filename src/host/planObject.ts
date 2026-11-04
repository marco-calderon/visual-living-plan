import { DurableObject } from 'cloudflare:workers'
import { Elysia } from 'elysia'
import { IDLE_MS } from './access'
import { rehydrateRequest } from './rehydrateRequest'
import {
  ackEvents,
  actorAllows,
  agentHello,
  closePlan,
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
  replyToComment,
  touchPlan,
  updateMode,
  type Outbound,
  type PlanSql,
} from './planRoom'
import type { UserMutationKind } from '../offlineSync'

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
    // An object that was never registered has no tables. Create them before any route reads one.
    migratePlan(this.sql())
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
        return this.userWrite(request, sql, 'interaction', (body) => submitInteraction(sql, params.id, body))
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
        const result = putExecution(sql, await request.json())
        this.publish(result.outbound)
        return Response.json(result.body)
      })
      .get('/api/execution', async ({ request }) => {
        if (!actorAllows(actorOf(request), authorizationOf(request), sql, 'read')) return text(401, 'Sign in required')
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
      action === 'reply' ? replyToComment(sql, commentId, body) : addressComment(sql, commentId, action === 'address' ? body : {}),
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
