export type Hub = {
  publish: (event: string, data: unknown) => void
  subscribe: (send: (frame: string) => void, close: () => void) => () => void
  close: () => void
}

type Subscriber = {
  send: (frame: string) => void
  close: () => void
}

export function formatSse(event: string, data: unknown, id: number): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export function createHub(): Hub {
  let nextId = 0
  let closed = false
  const subscribers = new Set<Subscriber>()

  return {
    publish(event, data) {
      if (closed) return
      const frame = formatSse(event, data, ++nextId)
      for (const subscriber of subscribers) {
        try {
          subscriber.send(frame)
        } catch {
          subscribers.delete(subscriber)
        }
      }
    },
    subscribe(send, close) {
      const subscriber = { send, close }
      subscribers.add(subscriber)
      return () => {
        subscribers.delete(subscriber)
      }
    },
    close() {
      closed = true
      for (const subscriber of subscribers) {
        try {
          subscriber.close()
        } catch {
          // The client is already gone.
        }
      }
      subscribers.clear()
    },
  }
}
