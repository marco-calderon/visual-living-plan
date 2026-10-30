import { useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import type { PlanComment } from '../src/types.ts'
import { CommentProgress } from './CommentProgress.tsx'
import { CommentReply } from './CommentReply.tsx'
import type { PlanPartElement } from './planParts.ts'
import { Bubble, BubbleContent } from './ui/Bubble.tsx'
import { isSendShortcut } from './ui/Kbd.tsx'
import { Message, MessageContent, MessageFooter } from './ui/Message.tsx'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle } from './ui/Popover.tsx'
import { Textarea } from './ui/Textarea.tsx'

export type CommentPopoverProps = {
  open: boolean
  anchor: PlanPartElement | null
  title: string
  excerpt: string
  comments: PlanComment[]
  sending: boolean
  error: string
  freshReplyIds?: ReadonlySet<string>
  onOpenChange: (open: boolean) => void
  onSend: (text: string) => Promise<void>
  onAddress: (id: string) => void
  onReplySettled?: (id: string) => void
}

type CommentStatusProps = {
  comment: PlanComment
  onAddress: () => void
}

function CommentStatus({ comment, onAddress }: CommentStatusProps) {
  if (comment.addressedAt) {
    return <span className="plan-comment-status is-addressed">Addressed</span>
  }
  if (comment.addressingAt) {
    return (
      <span className="plan-comment-status is-addressing">
        <CommentProgress />
        Addressing
      </span>
    )
  }
  return (
    <span className="plan-comment-status is-pending">
      Pending
      <button type="button" className="plan-comment-address" onClick={onAddress}>
        Mark addressed
      </button>
    </span>
  )
}

export function CommentPopover({
  open,
  anchor,
  title,
  excerpt,
  comments,
  sending,
  error,
  freshReplyIds,
  onOpenChange,
  onSend,
  onAddress,
  onReplySettled,
}: CommentPopoverProps) {
  const [draft, setDraft] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || sending) return
    try {
      await onSend(text)
      setDraft('')
    } catch {
      // PlanSelector keeps the error next to the field.
    }
  }

  function onDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!isSendShortcut(event)) return
    event.preventDefault()
    if (sending || event.currentTarget.value.trim().length === 0) return
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={false}>
      <PopoverContent
        className="plan-comment-popover"
        anchor={anchor}
        side="right"
        align="start"
        sideOffset={10}
        collisionPadding={{ top: 12, right: 12, bottom: 88, left: 12 }}
        collisionAvoidance={{ side: 'shift', align: 'shift', fallbackAxisSide: 'none' }}
        finalFocus={false}
      >
        <PopoverHeader>
          <PopoverTitle title={title}>{title}</PopoverTitle>
          {excerpt ? <PopoverDescription>{excerpt}</PopoverDescription> : null}
        </PopoverHeader>
        {comments.length > 0 ? (
          <div className="plan-comment-chat">
            {comments.map((comment) => (
              <div key={comment.id} className="plan-comment-turn">
                <Message align="end">
                  <MessageContent>
                    <Bubble variant="muted" align="end">
                      <BubbleContent>{comment.text}</BubbleContent>
                    </Bubble>
                    <MessageFooter>
                      <CommentStatus comment={comment} onAddress={() => onAddress(comment.id)} />
                    </MessageFooter>
                  </MessageContent>
                </Message>
                {(comment.replies ?? []).map((reply) => (
                  <Message key={reply.id} align="start">
                    <MessageContent>
                      <Bubble variant="ghost" align="start">
                        <BubbleContent>
                          <CommentReply
                            reply={{ id: reply.id, text: reply.text, fresh: freshReplyIds?.has(reply.id) }}
                            onSettled={onReplySettled}
                          />
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                ))}
              </div>
            ))}
          </div>
        ) : null}
        <form className="plan-comment-form" onSubmit={(event) => void submit(event)}>
          <Textarea
            value={draft}
            rows={3}
            placeholder="Type your message here."
            aria-label="Type your message here."
            aria-keyshortcuts="Control+Enter Meta+Enter"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onDraftKeyDown}
          />
          {error ? <p className="plan-comment-error">{error}</p> : null}
          <button type="submit" className="btn primary" disabled={sending || draft.trim().length === 0}>
            {sending ? 'Sending' : 'Send message'}
          </button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
