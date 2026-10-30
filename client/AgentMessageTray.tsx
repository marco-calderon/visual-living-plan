import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, MouseEvent, PointerEvent } from 'react'
import { ArrowUp, CircleCheck, CircleX, TriangleAlert } from 'lucide-react'
import { CommentProgress } from './CommentProgress.tsx'
import { CommentReply, type CommentReplyView } from './CommentReply.tsx'
import { Bubble, BubbleContent } from './ui/Bubble.tsx'
import { isSendShortcut, SendShortcut } from './ui/Kbd.tsx'
import { Message, MessageContent, MessageFooter } from './ui/Message.tsx'

export type AgentMessageStatus = 'working' | 'implemented' | 'errored' | 'issues' | 'pending'

export type AgentMessage = {
  id: string
  text: string
  status: AgentMessageStatus
  replies?: CommentReplyView[]
}

export type AgentMessageTrayProps = {
  messages: AgentMessage[]
  sending: boolean
  /** Changes when a new minibar reply should open the tray. */
  attentionKey?: string | null
  onSend: (text: string) => Promise<void>
  onReplySettled?: (id: string) => void
}

type MessageStateProps = {
  status: AgentMessageStatus
}

function MessageState({ status }: MessageStateProps) {
  if (status === 'working') {
    return (
      <span className="plan-agent-status is-working">
        <CommentProgress label="Working" />
        Working
      </span>
    )
  }
  if (status === 'implemented') {
    return (
      <span className="plan-agent-status is-implemented">
        <CircleCheck aria-hidden="true" size={16} />
        Implemented
      </span>
    )
  }
  if (status === 'errored') {
    return (
      <span className="plan-agent-status is-errored">
        <CircleX aria-hidden="true" size={16} />
        Errored
      </span>
    )
  }
  if (status === 'issues') {
    return (
      <span className="plan-agent-status is-issues">
        <TriangleAlert aria-hidden="true" size={16} />
        Had issues
      </span>
    )
  }
  return <span className="plan-agent-status is-pending">Pending</span>
}

function overMessages(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('.plan-agent-toggle, .plan-agent-panel'))
}

export function AgentMessageTray({
  messages,
  sending,
  attentionKey,
  onSend,
  onReplySettled,
}: AgentMessageTrayProps) {
  const [hovering, setHovering] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [draft, setDraft] = useState('')
  const dock = useRef<HTMLDivElement>(null)
  const open = hovering || focused || pinned

  useEffect(() => {
    if (!attentionKey) return
    setPinned(true)
  }, [attentionKey])

  useEffect(() => {
    const node = dock.current
    if (!node) return
    const onFocusIn = () => setFocused(true)
    const onFocusOut = (event: globalThis.FocusEvent) => {
      const next = event.relatedTarget
      if (next instanceof Node && node.contains(next)) return
      setFocused(false)
    }
    node.addEventListener('focusin', onFocusIn)
    node.addEventListener('focusout', onFocusOut)
    return () => {
      node.removeEventListener('focusin', onFocusIn)
      node.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: globalThis.PointerEvent) => {
      const node = dock.current
      if (!node || (event.target instanceof Node && node.contains(event.target))) return
      setPinned(false)
      setHovering(false)
      setFocused(false)
      if (document.activeElement instanceof HTMLElement && node.contains(document.activeElement)) {
        document.activeElement.blur()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  function onMouseOver(event: MouseEvent<HTMLDivElement>) {
    if (overMessages(event.target)) setHovering(true)
  }

  function onMouseOut(event: MouseEvent<HTMLDivElement>) {
    if (overMessages(event.relatedTarget)) return
    setHovering(false)
    const node = dock.current
    if (node?.contains(document.activeElement)) setFocused(true)
  }

  function onTogglePointerDown(event: PointerEvent<HTMLButtonElement>) {
    const coarse =
      event.pointerType === 'touch' ||
      event.pointerType === 'pen' ||
      window.matchMedia('(hover: none), (pointer: coarse)').matches
    if (coarse) setPinned(true)
  }

  const working = messages.some((message) => message.status === 'working')
  const label = working
    ? 'Messages in progress'
    : open
      ? 'Hide messages sent to the agent'
      : 'Show messages sent to the agent'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || sending) return
    await onSend(text)
    setDraft('')
  }

  function onDraftKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!isSendShortcut(event)) return
    event.preventDefault()
    if (sending || event.currentTarget.value.trim().length === 0) return
    event.currentTarget.form?.requestSubmit()
  }

  return (
    <div ref={dock} className="plan-agent-dock">
      <div
        className={open ? 'plan-agent-tray is-open' : 'plan-agent-tray'}
        onMouseOver={onMouseOver}
        onMouseOut={onMouseOut}
      >
        <div className="plan-agent-panel" role="region" aria-label="Messages sent to the agent" aria-hidden={open ? undefined : true}>
          <header className="plan-agent-chat-header">
            <p className="plan-agent-chat-title">Messages</p>
            <p className="plan-agent-chat-subtitle">Ask the agent to change the plan.</p>
          </header>
          <div className="plan-agent-messages">
            {messages.length > 0 ? (
              <div className="plan-agent-chat">
                {messages.map((message) => (
                  <div key={message.id} className="plan-agent-turn">
                    <Message align="end">
                      <MessageContent>
                        <Bubble variant="muted" align="end">
                          <BubbleContent>{message.text}</BubbleContent>
                        </Bubble>
                        <MessageFooter>
                          <MessageState status={message.status} />
                        </MessageFooter>
                      </MessageContent>
                    </Message>
                    {(message.replies ?? []).map((reply) => (
                      <Message key={reply.id} align="start">
                        <MessageContent>
                          <Bubble variant="ghost" align="start">
                            <BubbleContent>
                              <CommentReply reply={reply} onSettled={onReplySettled} />
                            </BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="plan-agent-empty">No messages yet</p>
            )}
          </div>
          <form className="plan-agent-composer" onSubmit={(event) => void submit(event)}>
            <textarea
              className="plan-agent-composer-input"
              rows={2}
              value={draft}
              placeholder="Add a message"
              aria-label="Add a message"
              aria-keyshortcuts="Control+Enter Meta+Enter"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onDraftKeyDown}
            />
            <div className="plan-agent-composer-bar">
              <SendShortcut />
              <button
                type="submit"
                className="plan-agent-send"
                aria-label={sending ? 'Sending' : 'Send'}
                disabled={sending || draft.trim().length === 0}
              >
                <ArrowUp size={16} aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>
        <button
          type="button"
          className={working ? 'plan-agent-toggle is-working' : 'plan-agent-toggle'}
          aria-expanded={open}
          aria-label={label}
          onPointerDown={onTogglePointerDown}
        >
          {working ? <CommentProgress label="Working" /> : `Messages${messages.length > 0 ? ` ${messages.length}` : ''}`}
        </button>
      </div>
    </div>
  )
}
