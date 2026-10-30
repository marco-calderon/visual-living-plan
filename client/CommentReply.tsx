import { useEffect } from 'react'

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
  useEffect(() => {
    if (!fresh) return
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    onSettled?.(reply.id)
  }, [fresh, onSettled, reply.id])
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
      {reply.text}
    </p>
  )
}
