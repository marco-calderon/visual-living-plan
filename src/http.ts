export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export function html(body: string): Response {
  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/** Use an Elysia-parsed body, or the raw text when the parser left it as a string. */
export function jsonBody(body: unknown, required = false): unknown {
  if (typeof body === 'string') {
    if (!body.trim()) {
      if (required) return JSON.parse(body)
      return {}
    }
    return JSON.parse(body)
  }
  if (body == null) {
    if (required) return JSON.parse('')
    return {}
  }
  return body
}

export function assertBodyLimit(request: Request, limit = 65_536): void {
  const header = request.headers.get('content-length')
  if (header !== null && Number(header) > limit) throw new Error('Body too large')
}
