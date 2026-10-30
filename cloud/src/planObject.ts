import { DurableObject } from 'cloudflare:workers'
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
    const sql = this.sql()
    const url = new URL(request.url)
    const actor = request.headers.get('x-living-plan-actor')
    const authorization = request.headers.get('authorization')
    try {
      if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
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

      if (url.pathname.endsWith('/internal/init') && request.method === 'POST') {
        const body = (await request.json()) as { token: string; title: string; mode: string; tier: string; source: string }
        const result = initPlan(sql, body)
        await this.armAlarm()
        return Response.json(result)
      }

      if (request.method === 'DELETE') {
        if (!actorAllows(actor, authorization, sql, 'close')) return text(401, 'Sign in required')
        closePlan(sql)
        for (const socket of this.ctx.getWebSockets()) {
          try {
            socket.close(1000, 'closed')
          } catch {
            // Already gone.
          }
        }
        return Response.json({ ok: true })
      }

      if (url.pathname.endsWith('/view')) {
        if (!actorAllows(actor, authorization, sql, 'read')) return text(401, 'Sign in required')
        touchPlan(sql)
        return Response.json(planView(sql))
      }

      if (url.pathname.endsWith('/source') && request.method === 'PUT') {
        if (!actorAllows(actor, authorization, sql, 'upload')) return text(401, 'Sign in required')
        const body = (await request.json()) as { markdown?: string; revision?: number; title?: string }
        const result = putSource(sql, {
          markdown: String(body.markdown ?? ''),
          revision: Number(body.revision ?? -1),
          title: body.title,
        })
        this.publish(result.outbound)
        await this.armAlarm()
        return Response.json({ revision: result.revision })
      }

      if ((url.pathname.endsWith('/theme') || url.pathname.endsWith('/git')) && request.method === 'PUT') {
        if (!actorAllows(actor, authorization, sql, 'upload')) return text(401, 'Sign in required')
        putBlob(sql, url.pathname.endsWith('/theme') ? 'theme' : 'git', await request.json())
        await this.armAlarm()
        return Response.json({ ok: true })
      }

      if (url.pathname.endsWith('/api/agent-events/ack') && request.method === 'POST') {
        if (!actorAllows(actor, authorization, sql, 'agent')) return text(401, 'Sign in required')
        const body = (await request.json()) as { ids?: string[] }
        return Response.json({ ok: true, ...ackEvents(sql, body.ids ?? []) })
      }

      if (url.pathname.includes('/api/interactions/') && request.method === 'POST') {
        if (!actorAllows(actor, authorization, sql, 'submit')) return text(401, 'Sign in required')
        const id = decodeURIComponent(url.pathname.split('/api/interactions/')[1] ?? '')
        const result = submitInteraction(sql, id, await request.json())
        this.publish(result.outbound)
        return Response.json(result.body)
      }

      if (url.pathname.endsWith('/api/comments') && request.method === 'POST') {
        if (!actorAllows(actor, authorization, sql, 'submit')) return text(401, 'Sign in required')
        const result = submitComment(sql, await request.json())
        this.publish(result.outbound)
        return Response.json(result.body)
      }

      const commentAction = /\/api\/comments\/([^/]+)\/(reply|address|addressing)$/.exec(url.pathname)
      if (commentAction && request.method === 'POST') {
        if (!actorAllows(actor, authorization, sql, 'submit') && !actorAllows(actor, authorization, sql, 'upload')) {
          return text(401, 'Sign in required')
        }
        const commentId = decodeURIComponent(commentAction[1] ?? '')
        const action = commentAction[2]
        const result =
          action === 'reply'
            ? replyToComment(sql, commentId, await request.json())
            : addressComment(sql, commentId, action === 'address' ? await request.json() : {})
        this.publish(result.outbound)
        return Response.json(result.body)
      }

      if (url.pathname.endsWith('/api/review') && request.method === 'POST') {
        if (!actorAllows(actor, authorization, sql, 'submit')) return text(401, 'Sign in required')
        const result = submitReview(sql, await request.json())
        this.publish(result.outbound)
        return Response.json(result.body)
      }

      if (url.pathname.endsWith('/api/mode') && request.method === 'POST') {
        if (!actorAllows(actor, authorization, sql, 'upload') && !actorAllows(actor, authorization, sql, 'submit')) {
          return text(401, 'Sign in required')
        }
        const result = updateMode(sql, await request.json())
        this.publish(result.outbound)
        return Response.json(result.body)
      }

      if (url.pathname.endsWith('/api/execution') && request.method === 'PUT') {
        if (!actorAllows(actor, authorization, sql, 'upload')) return text(401, 'Sign in required')
        const result = putExecution(sql, await request.json())
        this.publish(result.outbound)
        return Response.json(result.body)
      }

      if (url.pathname.endsWith('/api/plan-mdx') && request.method === 'GET') {
        if (!actorAllows(actor, authorization, sql, 'read')) return text(401, 'Sign in required')
        const view = planView(sql)
        return Response.json({
          source: view.source,
          title: view.title,
          responses: view.responses,
          locked: false,
          snapshots: [],
          headSnapshotId: null,
        })
      }

      if (url.pathname.endsWith('/api/events') && request.method === 'GET') {
        if (!actorAllows(actor, authorization, sql, 'read')) return text(401, 'Sign in required')
        return Response.json({ pending: pendingEvents(sql) })
      }

      return text(404, 'Not found')
    } catch (error) {
      if (error instanceof StaleRevision) return Response.json({ revision: error.revision }, { status: 409 })
      if (error instanceof PlanRoomError) return text(error.status, error.message)
      throw error
    }
  }
}

function text(status: number, message: string): Response {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
