export type CommentReplyView = {
  id: string
  text: string
  fresh?: boolean
}

export type CommentReplyProps = {
  reply: CommentReplyView
  onSettled?: (id: string) => void
}

export function CommentReply({ reply, onSettled }: CommentReplyProps) {
  const fresh = reply.fresh === true
  return (
    <p
      className={fresh ? 'plan-comment-reply reply-applied' : 'plan-comment-reply'}
      data-reply-id={reply.id}
      onAnimationEnd={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.animationName !== 'reply-applied') return
        onSettled?.(reply.id)
      }}
    >
      <span className="plan-comment-reply-label">Agent</span>
      {reply.text}
    </p>
  )
}
