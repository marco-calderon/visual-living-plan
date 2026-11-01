/** Elysia reads a JSON body before the route handler. Workers cannot read that body twice. */
export function replayableRequest(request: Request): Request {
  if (request.method === 'GET' || request.method === 'HEAD' || !request.body) return request
  let bytes: Promise<ArrayBuffer> | undefined
  const read = () => {
    bytes ??= request.arrayBuffer()
    return bytes
  }
  const body = new ReadableStream()
  return new Proxy(request, {
    get(target, prop, receiver) {
      if (prop === 'json') return async () => JSON.parse(new TextDecoder().decode(await read()))
      if (prop === 'text') return async () => new TextDecoder().decode(await read())
      if (prop === 'arrayBuffer') return async () => (await read()).slice(0)
      if (prop === 'bodyUsed') return false
      if (prop === 'body') return target.body ?? body
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
