type RequestContext = {
  request: Request
  body: unknown
}

/** Elysia reads a JSON body before the route runs. Handlers need a new request with that body. */
export function rehydrateRequest(context: RequestContext): void {
  const { request, body } = context
  if (request.method === 'GET' || request.method === 'HEAD' || body == null) return
  context.request = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}
