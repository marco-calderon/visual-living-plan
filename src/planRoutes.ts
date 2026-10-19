import { HttpError } from './http'
import { readClientAsset, type PlanSession } from './planSession'

const ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/

export type PlanRouteOptions = {
  hosted: boolean
  resolve: (id: string | undefined) => PlanSession | undefined
  /** Hosted agent streams require the plan token or the service token. */
  authorizeAgent?: (request: Request, session: PlanSession) => boolean
}

type RouteContext = {
  request: Request
  body: unknown
  params: Record<string, string | undefined>
  set: { status?: number | string }
}

/**
 * Elysia's route generics make a shared plugin painful to type, so this registers
 * the plan handlers on the app instance the caller already created.
 */
export function registerPlanRoutes(app: any, options: PlanRouteOptions): any {
  const sessionFor = (id: string | undefined): PlanSession => {
    if (options.hosted) {
      if (!id || !ID_PATTERN.test(id)) throw new HttpError(404, 'Not found')
      const session = options.resolve(id)
      if (!session) throw new HttpError(404, 'Plan not found')
      return session
    }
    const session = options.resolve(undefined)
    if (!session) throw new HttpError(404, 'Plan not found')
    return session
  }

  const route = (suffix: string): string => (options.hosted ? `/plans/:id${suffix}` : suffix)

  const idOf = (context: RouteContext): string | undefined => context.params?.id

  async function clientAsset(context: RouteContext, session: PlanSession | undefined): Promise<unknown> {
    if (session) session.touch()
    const response = await readClientAsset(String(context.params?.['*'] ?? ''))
    if (!response) {
      context.set.status = 404
      return { error: 'Asset not found' }
    }
    return response
  }

  if (options.hosted) {
    app.get('/plans/:id', ({ params }: RouteContext) => {
      if (!params.id || !ID_PATTERN.test(params.id)) throw new HttpError(404, 'Not found')
      return new Response(null, {
        status: 302,
        headers: { location: `/plans/${params.id}/` },
      })
    })
  }

  return app
    .get(route('/client/*'), (context: RouteContext) => {
      const session = sessionFor(options.hosted ? idOf(context) : undefined)
      return clientAsset(context, session)
    })
    .get(options.hosted ? '/plans/:id/' : '/', (context: RouteContext) => sessionFor(idOf(context)).page())
    .get(route('/api/plan'), (context: RouteContext) => sessionFor(idOf(context)).planPayload())
    .get(route('/api/theme'), (context: RouteContext) => sessionFor(idOf(context)).themeView())
    .put(route('/api/theme'), (context: RouteContext) => sessionFor(idOf(context)).updateTheme(context.body))
    .get(route('/api/execution'), (context: RouteContext) => sessionFor(idOf(context)).executionPayload())
    .put(route('/api/execution'), (context: RouteContext) => sessionFor(idOf(context)).updateExecution(context.body))
    .post(route('/api/execution/start'), (context: RouteContext) => sessionFor(idOf(context)).startExecution(context.body))
    .post(route('/api/execution/stop'), (context: RouteContext) => sessionFor(idOf(context)).stopExecution())
    .get(route('/api/events'), (context: RouteContext) => sessionFor(idOf(context)).browserEvents(context.request))
    .get(route('/api/agent-events'), (context: RouteContext) => {
      const session = sessionFor(idOf(context))
      if (options.authorizeAgent && !options.authorizeAgent(context.request, session)) {
        throw new HttpError(401, 'Unauthorized')
      }
      return session.agentEvents(context.request)
    })
    .post(route('/api/agent-events/ack'), (context: RouteContext) => {
      const session = sessionFor(idOf(context))
      if (options.authorizeAgent && !options.authorizeAgent(context.request, session)) {
        throw new HttpError(401, 'Unauthorized')
      }
      return session.acknowledgeEvents(context.body)
    })
    .post(route('/api/interactions/:interactionId'), (context: RouteContext) => {
      const interactionId = context.params?.interactionId ?? ''
      return sessionFor(idOf(context)).submitInteraction(interactionId, context.body)
    })
    .post(route('/api/comments'), (context: RouteContext) => sessionFor(idOf(context)).submitComment(context.body))
    .post(route('/api/comments/:commentId/address'), (context: RouteContext) =>
      sessionFor(idOf(context)).addressComment(context.params?.commentId ?? '', context.body),
    )
    .post(route('/api/comments/:commentId/reply'), (context: RouteContext) =>
      sessionFor(idOf(context)).replyToComment(context.params?.commentId ?? '', context.body),
    )
    .post(route('/api/comments/:commentId/addressing'), (context: RouteContext) =>
      sessionFor(idOf(context)).markAddressing(context.params?.commentId ?? ''),
    )
    .post(route('/api/review'), (context: RouteContext) => sessionFor(idOf(context)).submitReview(context.body))
    .post(route('/api/mode'), (context: RouteContext) => sessionFor(idOf(context)).updateMode(context.body))
}
