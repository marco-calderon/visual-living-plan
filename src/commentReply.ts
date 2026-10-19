import type { PlanComment } from './types'

/** Where an agent reply is shown. Minibar messages stay on the tray. Every other comment stays on its part. */
export type ReplySurface = 'minibar' | 'component'

export type ReplyArrival = {
  replyIds: string[]
  surface: ReplySurface
}

export function replySurface(comment: { kind?: string; partId?: string }): ReplySurface {
  if (comment.kind === 'message' || comment.partId === 'review:message') return 'minibar'
  return 'component'
}

/** Reply ids on `incoming` that were not already stored on that comment. */
export function newReplyIds(
  previous: Array<{ id: string; replies?: Array<{ id: string }> }>,
  incoming: { id: string; replies?: Array<{ id: string }> },
): string[] {
  const prior = new Set(
    (previous.find((entry) => entry.id === incoming.id)?.replies ?? []).flatMap((reply) =>
      reply.id ? [reply.id] : [],
    ),
  )
  return (incoming.replies ?? []).flatMap((reply) => (reply.id && !prior.has(reply.id) ? [reply.id] : []))
}

/** A comment event that carries at least one new agent reply, and which surface should reveal it. */
export function replyArrival(previous: PlanComment[], incoming: PlanComment): ReplyArrival | null {
  const replyIds = newReplyIds(previous, incoming)
  if (replyIds.length === 0) return null
  return { replyIds, surface: replySurface(incoming) }
}
