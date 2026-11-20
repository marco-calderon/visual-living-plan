/** When a comment was submitted. A comment without a time counts as the oldest. */
function submittedAt(comment: { createdAt?: unknown }): number {
  return typeof comment.createdAt === 'number' && Number.isFinite(comment.createdAt) ? comment.createdAt : 0
}

/**
 * Comments oldest first, by the time they were submitted: the order the host stores them in. The
 * device copy keeps rows by their random id, so the page cannot trust the order a source hands it.
 * Comments with the same time keep the order they came in.
 */
export function inSubmissionOrder<T extends { createdAt?: unknown }>(comments: readonly T[]): T[] {
  return [...comments].sort((left, right) => submittedAt(left) - submittedAt(right))
}

/** Comments newest first: the order the comment popover and the messages tray show them in. */
export function newestFirst<T extends { createdAt?: unknown }>(comments: readonly T[]): T[] {
  return inSubmissionOrder(comments).reverse()
}

/**
 * A review note placed among messages listed newest first. The note was sent with the review, after
 * the comments it carried, so it goes above the newest of them that is listed, or on top when none is.
 */
export function withReviewNote<T extends { id: string }>(messages: readonly T[], note: T, carried: readonly string[]): T[] {
  const ids = new Set(carried)
  const found = messages.findIndex((message) => ids.has(message.id))
  const at = found === -1 ? 0 : found
  return [...messages.slice(0, at), note, ...messages.slice(at)]
}
