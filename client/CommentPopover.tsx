import { useState } from 'react'
import type { FormEvent } from 'react'
import type { PlanComment } from '../src/types.ts'
import type { PlanPartElement } from './planParts.ts'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle } from './ui/Popover.tsx'

export type CommentPopoverProps = {
  open: boolean
  anchor: PlanPartElement | null
  title: string
  excerpt: string
  comments: PlanComment[]
  sending: boolean
  error: string
  onOpenChange: (open: boolean) => void
  onSend: (text: string) => Promise<void>
  onAddress: (id: string) => void
}

export function CommentPopover({
  open,
  anchor,
  title,
  excerpt,
  comments,
  sending,
  error,
  onOpenChange,
  onSend,
  onAddress,
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

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={false}>
      <PopoverContent
        anchor={anchor}
        side="right"
        align="start"
        sideOffset={10}
        collisionPadding={12}
        collisionAvoidance={{ side: 'shift', align: 'shift', fallbackAxisSide: 'none' }}
        finalFocus={false}
      >
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          {excerpt ? <PopoverDescription>{excerpt}</PopoverDescription> : null}
        </PopoverHeader>
        {comments.length > 0 ? (
          <ul className="plan-comment-list">
            {comments.map((comment) => (
              <li key={comment.id}>
                <p>{comment.text}</p>
                {comment.addressedAt ? (
                  <span className="plan-comment-state">Addressed</span>
                ) : (
                  <button type="button" className="btn" onClick={() => onAddress(comment.id)}>
                    Mark addressed
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <form className="plan-comment-form" onSubmit={(event) => void submit(event)}>
          <textarea
            className="plan-comment-input"
            value={draft}
            rows={3}
            placeholder="Message for the agent"
            aria-label="Message for the agent"
            onChange={(event) => setDraft(event.target.value)}
          />
          {error ? <p className="plan-comment-error">{error}</p> : null}
          <div className="plan-comment-actions">
            <button type="submit" className="btn primary" disabled={sending || draft.trim().length === 0}>
              {sending ? 'Sending' : 'Send'}
            </button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
