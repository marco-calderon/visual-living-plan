import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { replyArrival, replySurface } from '../src/commentReply.ts'
import type { PlanComment, ReviewResult } from '../src/types.ts'
import { AgentMessageTray, type AgentMessage, type AgentMessageStatus } from './AgentMessageTray.tsx'
import { ApproveButton } from './ApproveButton.tsx'
import { CommentPopover } from './CommentPopover.tsx'
import { CommentToggle } from './CommentToggle.tsx'
import { GrabOverlay } from './GrabOverlay.tsx'
import {
  blockIdFromPart,
  describe,
  findPartElement,
  highlightChangedPart,
  parentPart,
  childPart,
  partLabel,
  resolvePart,
  type PlanPart,
} from './planParts.ts'
import { UnaddressedMark } from './UnaddressedMark.tsx'
import { subscribePlanEvents } from './planEvents.ts'
import './planSelector.css'

type PlanWindow = Window & {
  __LIVE_PLAN_BASE__?: string
}

type Mark = {
  partId: string
  count: number
  top: number
  left: number
  busy: boolean
}

type SentReview = {
  note?: string
  ids: string[]
}

type HeldOverlay = {
  partId: string
  rect: DOMRect
  label: string
  enterFrom: { x: number; y: number } | null
}

function apiPath(path: string): string {
  const base = (window as PlanWindow).__LIVE_PLAN_BASE__ ?? ''
  return `${base}${path}`
}

type SessionMode = 'watch' | 'comment' | 'review'

function readMode(): SessionMode {
  const value = document.body.dataset.planMode
  if (value === 'comment' || value === 'review' || value === 'watch') return value
  return 'watch'
}

function readSentReview(): SentReview | null {
  const node = document.getElementById('living-plan-review')
  if (!node?.textContent) return null
  try {
    const parsed = JSON.parse(node.textContent) as ReviewResult | null
    if (parsed?.decision !== 'iterate') return null
    return {
      note: parsed.note,
      ids: (parsed.comments ?? []).flatMap((comment) => (comment.id ? [comment.id] : [])),
    }
  } catch {
    return null
  }
}
function readComments(): PlanComment[] {
  const node = document.getElementById('living-plan-comments')
  if (!node?.textContent) return []
  try {
    const parsed = JSON.parse(node.textContent) as PlanComment[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function rectClose(left: DOMRect, right: DOMRect): boolean {
  return (
    Math.abs(left.top - right.top) < 0.5 &&
    Math.abs(left.left - right.left) < 0.5 &&
    Math.abs(left.width - right.width) < 0.5 &&
    Math.abs(left.height - right.height) < 0.5
  )
}

function planPanelOwns(target: Element): boolean {
  const panel = document.querySelector('[data-tab-panel="plan"]')
  if (!(panel instanceof HTMLElement) || panel.hidden) return false
  if (panel.contains(target)) return true
  if (target.closest('.mermaid-diagram')) return true
  const root = target.getRootNode()
  return root instanceof ShadowRoot && panel.contains(root.host)
}

function messageStatus(comment: PlanComment): AgentMessageStatus {
  if (comment.outcome === 'implemented' || comment.outcome === 'errored' || comment.outcome === 'issues') {
    return comment.outcome
  }
  if (comment.addressedAt) return 'implemented'
  if (comment.addressingAt) return 'working'
  return 'pending'
}

function upsert(comments: PlanComment[], comment: PlanComment): PlanComment[] {
  const index = comments.findIndex((entry) => entry.id === comment.id)
  if (index === -1) return [...comments, comment]
  const next = comments.slice()
  next[index] = comment
  return next
}

function trayMessages(
  comments: PlanComment[],
  note: string | undefined,
  fresh: ReadonlySet<string>,
): AgentMessage[] {
  return [
    ...(note?.trim() ? [{ id: 'review-note', text: note.trim(), status: 'pending' as const }] : []),
    ...comments.map((comment) => ({
      id: comment.id,
      text: comment.text,
      status: messageStatus(comment),
      replies: (comment.replies ?? []).map((reply) => ({
        id: reply.id,
        text: reply.text,
        fresh: fresh.has(reply.id),
      })),
    })),
  ]
}

export function PlanSelector() {
  const [mode, setMode] = useState<SessionMode>(readMode)
  const [commentsOn, setCommentsOn] = useState(() => readMode() !== 'watch')
  const modeRef = useRef(mode)
  modeRef.current = mode
  const enabled = mode === 'review' ? commentsOn : mode !== 'watch'
  const [comments, setComments] = useState<PlanComment[]>(readComments)
  const commentsRef = useRef(comments)
  const [freshReplies, setFreshReplies] = useState<ReadonlySet<string>>(() => new Set())
  const [trayAttention, setTrayAttention] = useState<string | null>(null)
  const [replyReveal, setReplyReveal] = useState(false)
  const [hover, setHover] = useState<PlanPart | null>(null)
  const [locked, setLocked] = useState<PlanPart | null>(null)
  const [open, setOpen] = useState(false)
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null)
  const [enterFrom, setEnterFrom] = useState<{ x: number; y: number } | null>(null)
  const [heldOverlay, setHeldOverlay] = useState<HeldOverlay | null>(null)
  const [sentReview, setSentReview] = useState<SentReview | null>(readSentReview)
  const overlayVisibleRef = useRef(false)
  const iterateLocked = useRef(false)
  const [marks, setMarks] = useState<Mark[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const hoverRef = useRef(hover)
  const lockedRef = useRef(locked)
  hoverRef.current = hover
  lockedRef.current = locked

  const openComments = useMemo(
    () => comments.filter((comment) => comment.addressedAt == null),
    [comments],
  )
  const thread = useMemo(
    () => (locked ? comments.filter((comment) => comment.partId === locked.partId) : []),
    [comments, locked],
  )

  useEffect(() => {
    const onDocument = (event: Event) => {
      const root = (event as CustomEvent<{ root?: Element }>).detail?.root
      setHover(null)
      if (!(root instanceof Element)) {
        setLocked(null)
        setOpen(false)
        return
      }
      const lockedPart = lockedRef.current?.partId
      const scope = root.getAttribute('data-plan-part')
      const touched =
        lockedPart != null &&
        (lockedPart === scope ||
          (scope != null && lockedPart.startsWith(scope + '/')) ||
          root.querySelector(`[data-plan-part="${CSS.escape(lockedPart)}"]`) != null)
      if (touched) {
        setLocked(null)
        setOpen(false)
      }
    }
    window.addEventListener('living-plan-document', onDocument)
    return () => window.removeEventListener('living-plan-document', onDocument)
  }, [])

  useEffect(() => {
    const onMode = (event: Event) => {
      const next = (event as CustomEvent<{ mode?: SessionMode }>).detail?.mode
      if (next !== 'watch' && next !== 'comment' && next !== 'review') return
      if (next === modeRef.current) return
      setMode(next)
      setCommentsOn(next !== 'watch')
    }
    window.addEventListener('living-plan-mode', onMode)
    return () => window.removeEventListener('living-plan-mode', onMode)
  }, [])

  function commitComments(update: (current: PlanComment[]) => PlanComment[]) {
    const next = update(commentsRef.current)
    commentsRef.current = next
    setComments(next)
  }

  function settleReply(id: string) {
    setFreshReplies((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }

  function revealReply(previous: PlanComment[], comment: PlanComment) {
    const arrival = replyArrival(previous, comment)
    if (!arrival) return
    setFreshReplies((current) => {
      const next = new Set(current)
      for (const id of arrival.replyIds) next.add(id)
      return next
    })
    const latest = arrival.replyIds[arrival.replyIds.length - 1] ?? null
    if (arrival.surface === 'minibar') {
      setTrayAttention(latest)
      return
    }
    highlightChangedPart(comment.partId)
    const element = findPartElement(comment.partId)
    if (!element) return
    const described = describe(element)
    setLocked(described)
    setHover(described)
    setHoverRect(described.element.getBoundingClientRect())
    setError('')
    setReplyReveal(true)
    setOpen(true)
  }

  useEffect(() => {
    document.body.classList.toggle('plan-grab-armed', enabled)
    if (!enabled && !replyReveal) {
      setHover(null)
      setOpen(false)
      setLocked(null)
    }
    return () => document.body.classList.remove('plan-grab-armed')
  }, [enabled, replyReveal])

  async function approvePlan() {
    const response = await fetch(apiPath('/api/review'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    })
    if (!response.ok) setError('Could not approve')
  }

  async function sendTrayMessage(text: string) {
    setSending(true)
    setError('')
    try {
      const response = await fetch(apiPath('/api/comments'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ partId: 'review:message', kind: 'message', text }),
      })
      if (!response.ok) throw new Error((await response.text()) || 'Could not send the message')
      const body = (await response.json()) as { comment?: PlanComment }
      if (body.comment) commitComments((current) => upsert(current, body.comment as PlanComment))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the message')
      throw cause
    } finally {
      setSending(false)
    }
  }

  async function toggleMode() {
    if (mode === 'review') {
      setCommentsOn((current) => !current)
      return
    }
    const next = mode === 'watch' ? 'comment' : 'watch'
    const response = await fetch(apiPath('/api/mode'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: next }),
    })
    if (!response.ok) {
      setError('Could not change mode')
      return
    }
    setMode(next)
    setCommentsOn(next !== 'watch')
  }

  useEffect(() => {
    return subscribePlanEvents('comment', (event) => {
      try {
        const comment = JSON.parse(event.data) as PlanComment
        if (!comment?.id || !comment.partId) return
        const previous = commentsRef.current
        commitComments((current) => upsert(current, comment))
        revealReply(previous, comment)
      } catch {
        // Ignore a malformed event.
      }
    })
  }, [])

  useEffect(() => {
    if (!enabled) return
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return
      const target = event.target
      if (!(target instanceof Element) || target.closest('[data-plan-grab-ignore]')) return
      if (!planPanelOwns(target)) return
      const part = resolvePart(target)
      if (!part) return
      event.preventDefault()
      event.stopPropagation()
      const described = describe(part)
      setLocked(described)
      setHover(described)
      setHoverRect(described.element.getBoundingClientRect())
      setError('')
      setOpen(true)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [enabled])

  useEffect(() => {
    if (!enabled || open) return
    const onMove = (event: PointerEvent) => {
      const hit = document.elementFromPoint(event.clientX, event.clientY)
      if (!(hit instanceof Element) || !planPanelOwns(hit)) {
        setHover(null)
        return
      }
      const part = resolvePart(hit)
      const current = hoverRef.current?.element
      if (!part) {
        setHover(null)
        return
      }
      if (part === current) return
      if (!current) setEnterFrom({ x: event.clientX, y: event.clientY })
      const described = describe(part)
      setHover(described)
      setHoverRect(described.element.getBoundingClientRect())
    }
    document.addEventListener('pointermove', onMove)
    return () => document.removeEventListener('pointermove', onMove)
  }, [enabled, open])

  useEffect(() => {
    if (!enabled || open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.closest('input, textarea, select') || target.isContentEditable)
      ) {
        return
      }
      const current = hoverRef.current?.element
      if (!current) return
      const next = event.key === 'ArrowUp' ? parentPart(current) : childPart(current)
      if (!next) return
      event.preventDefault()
      const described = describe(next)
      setHover(described)
      setHoverRect(described.element.getBoundingClientRect())
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled, open])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'c' && event.key !== 'C') return
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.closest('input, textarea, select') || target.isContentEditable)
      ) {
        return
      }
      event.preventDefault()
      void toggleMode()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mode, commentsOn])

  useEffect(() => {
    const onReview = (event: Event) => {
      const detail = (event as CustomEvent<ReviewResult>).detail
      if (detail?.decision !== 'iterate') return
      setSentReview({
        note: detail.note,
        ids: (detail.comments ?? []).flatMap((comment) => (comment.id ? [comment.id] : [])),
      })
    }
    window.addEventListener('living-plan-review', onReview)
    return () => window.removeEventListener('living-plan-review', onReview)
  }, [])

  useEffect(() => {
    if (!sentReview || iterateLocked.current) return
    const first = comments.find(
      (comment) => sentReview.ids.includes(comment.id) && comment.addressingAt && comment.addressedAt == null,
    )
    if (!first) return
    const element = findPartElement(first.partId)
    if (!element) return
    iterateLocked.current = true
    const described = describe(element)
    setLocked(described)
    setHover(described)
    setHoverRect(element.getBoundingClientRect())
    setOpen(true)
  }, [sentReview, comments])

  useEffect(() => {
    const tracking = enabled || openComments.length > 0 || open
    if (!tracking) {
      setHoverRect(null)
      setMarks([])
      return
    }
    let frame = 0
    const measure = () => {
      const overlay = (open ? lockedRef.current : hoverRef.current)?.element
      if (overlay?.isConnected) {
        const rect = overlay.getBoundingClientRect()
        setHoverRect((current) => (current && rectClose(current, rect) ? current : rect))
      } else {
        setHoverRect(null)
      }

      const groups = new Map<string, { count: number; busy: boolean }>()
      for (const comment of openComments) {
        const current = groups.get(comment.partId) ?? { count: 0, busy: false }
        groups.set(comment.partId, {
          count: current.count + 1,
          busy: current.busy || comment.addressingAt != null,
        })
      }
      const next: Mark[] = []
      for (const [partId, group] of groups) {
        const element = findPartElement(partId)
        if (!element?.isConnected || element.closest('[hidden]')) continue
        const rect = element.getBoundingClientRect()
        if (rect.width < 2 && rect.height < 2) continue
        next.push({
          partId,
          count: group.count,
          busy: group.busy,
          top: rect.top - 8,
          left: rect.right - 8,
        })
      }
      setMarks((current) => {
        if (
          current.length === next.length &&
          current.every(
            (mark, index) =>
              mark.partId === next[index]?.partId &&
              mark.count === next[index]?.count &&
              mark.busy === next[index]?.busy &&
              Math.abs(mark.top - (next[index]?.top ?? 0)) < 0.5 &&
              Math.abs(mark.left - (next[index]?.left ?? 0)) < 0.5,
          )
        ) {
          return current
        }
        return next
      })
      frame = requestAnimationFrame(measure)
    }
    frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [enabled, open, openComments])

  function openPart(partId: string) {
    const element = findPartElement(partId)
    if (!element) return
    const described = describe(element)
    setLocked(described)
    setHoverRect(described.element.getBoundingClientRect())
    setError('')
    setOpen(true)
  }

  async function send(text: string) {
    if (!locked) return
    setSending(true)
    setError('')
    try {
      const response = await fetch(apiPath('/api/comments'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          partId: locked.partId,
          kind: locked.kind,
          blockId: blockIdFromPart(locked.partId),
          excerpt: locked.excerpt,
          text,
        }),
      })
      if (!response.ok) throw new Error((await response.text()) || 'Could not send the comment')
      const body = (await response.json()) as { comment?: PlanComment }
      if (body.comment) commitComments((current) => upsert(current, body.comment as PlanComment))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the comment')
      throw cause
    } finally {
      setSending(false)
    }
  }

  async function address(id: string) {
    const response = await fetch(apiPath(`/api/comments/${encodeURIComponent(id)}/address`), {
      method: 'POST',
    })
    if (!response.ok) return
    const body = (await response.json()) as { comment?: PlanComment }
    if (body.comment) commitComments((current) => upsert(current, body.comment as PlanComment))
  }

  const overlay = open ? locked : hover
  const heading = locked?.excerpt.trim() || (locked ? locked.kind.replaceAll('-', ' ') : 'Comment')
  const overlayLive = Boolean(overlay && hoverRect)
  overlayVisibleRef.current = overlayLive
  const shownOverlay =
    overlay && hoverRect
      ? {
          partId: overlay.partId,
          rect: hoverRect,
          label: partLabel(overlay.kind, overlay.excerpt),
          enterFrom,
        }
      : heldOverlay

  useEffect(() => {
    if (!overlay || !hoverRect) return
    setHeldOverlay({
      partId: overlay.partId,
      rect: hoverRect,
      label: partLabel(overlay.kind, overlay.excerpt),
      enterFrom,
    })
  }, [overlay, hoverRect, enterFrom])

  return (
    <>
      {shownOverlay ? (
        <GrabOverlay
          partId={shownOverlay.partId}
          rect={shownOverlay.rect}
          label={shownOverlay.label}
          enterFrom={shownOverlay.enterFrom}
          visible={overlayLive}
          onExited={() => {
            if (overlayVisibleRef.current) return
            setHeldOverlay(null)
          }}
        />
      ) : null}
      {marks.map((mark) => (
        <UnaddressedMark
          key={mark.partId}
          count={mark.count}
          busy={mark.busy}
          style={{ top: mark.top, left: mark.left }}
          onClick={() => openPart(mark.partId)}
        />
      ))}
      <CommentPopover
        open={open}
        anchor={locked?.element ?? null}
        title={heading}
        excerpt=""
        comments={thread}
        sending={sending}
        error={error}
        freshReplyIds={freshReplies}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            setLocked(null)
            setReplyReveal(false)
          }
        }}
        onSend={send}
        onAddress={(id) => void address(id)}
        onReplySettled={settleReply}
      />
      <div className="plan-corner-actions">
        <CommentToggle enabled={enabled} onToggle={() => void toggleMode()} />
        {mode === 'review' && !sentReview ? <ApproveButton onApprove={() => void approvePlan()} /> : null}
      </div>
      {mode === 'review' || comments.some((comment) => replySurface(comment) === 'minibar') ? (
        <AgentMessageTray
          sending={sending}
          attentionKey={trayAttention}
          onSend={sendTrayMessage}
          onReplySettled={settleReply}
          messages={trayMessages(comments, sentReview?.note, freshReplies)}
        />
      ) : null}
    </>
  )
}

const mount = document.createElement('div')
mount.id = 'plan-selector-root'
document.body.append(mount)
createRoot(mount).render(<PlanSelector />)
