import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { PlanComment } from '../src/types.ts'
import { CommentPopover } from './CommentPopover.tsx'
import { CommentToggle } from './CommentToggle.tsx'
import { GrabOverlay } from './GrabOverlay.tsx'
import {
  blockIdFromPart,
  describe,
  findPartElement,
  parentPart,
  childPart,
  partLabel,
  resolvePart,
  type PlanPart,
} from './planParts.ts'
import { UnaddressedMark } from './UnaddressedMark.tsx'
import './planSelector.css'

type PlanWindow = Window & {
  __LIVE_PLAN_BASE__?: string
}

type Mark = {
  partId: string
  count: number
  top: number
  left: number
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
  const root = target.getRootNode()
  return root instanceof ShadowRoot && panel.contains(root.host)
}

function upsert(comments: PlanComment[], comment: PlanComment): PlanComment[] {
  const index = comments.findIndex((entry) => entry.id === comment.id)
  if (index === -1) return [...comments, comment]
  const next = comments.slice()
  next[index] = comment
  return next
}

export function PlanSelector() {
  const [mode, setMode] = useState<SessionMode>(readMode)
  const enabled = mode !== 'watch'
  const [comments, setComments] = useState<PlanComment[]>(readComments)
  const [hover, setHover] = useState<PlanPart | null>(null)
  const [locked, setLocked] = useState<PlanPart | null>(null)
  const [open, setOpen] = useState(false)
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null)
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
      if (next === 'watch' || next === 'comment' || next === 'review') setMode(next)
    }
    window.addEventListener('living-plan-mode', onMode)
    return () => window.removeEventListener('living-plan-mode', onMode)
  }, [])

  useEffect(() => {
    document.body.classList.toggle('plan-grab-armed', enabled)
    if (!enabled) {
      setHover(null)
      setOpen(false)
      setLocked(null)
    }
    return () => document.body.classList.remove('plan-grab-armed')
  }, [enabled])

  async function toggleMode() {
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
  }

  useEffect(() => {
    const source = new EventSource(apiPath('/api/events'))
    const onComment = (event: Event) => {
      try {
        const comment = JSON.parse((event as MessageEvent).data) as PlanComment
        if (!comment?.id || !comment.partId) return
        setComments((current) => upsert(current, comment))
      } catch {
        // Ignore a malformed event.
      }
    }
    source.addEventListener('comment', onComment)
    return () => source.close()
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
      // Keep the current part across padding and parent wrappers so the box glides
      // to the next leaf instead of expanding to the whole section in the gap.
      if (!part || part === current || (current && part.contains(current))) return
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

      const groups = new Map<string, number>()
      for (const comment of openComments) {
        groups.set(comment.partId, (groups.get(comment.partId) ?? 0) + 1)
      }
      const next: Mark[] = []
      for (const [partId, count] of groups) {
        const element = findPartElement(partId)
        if (!element?.isConnected || element.closest('[hidden]')) continue
        const rect = element.getBoundingClientRect()
        if (rect.width < 2 && rect.height < 2) continue
        next.push({ partId, count, top: rect.top - 8, left: rect.right - 8 })
      }
      setMarks((current) => {
        if (
          current.length === next.length &&
          current.every(
            (mark, index) =>
              mark.partId === next[index]?.partId &&
              mark.count === next[index]?.count &&
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
      if (body.comment) setComments((current) => upsert(current, body.comment as PlanComment))
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
    if (body.comment) setComments((current) => upsert(current, body.comment as PlanComment))
  }

  const overlay = open ? locked : hover
  const heading = locked?.excerpt.trim() || (locked ? locked.kind.replaceAll('-', ' ') : 'Comment')

  return (
    <>
      {overlay && hoverRect ? (
        <GrabOverlay partId={overlay.partId} rect={hoverRect} label={partLabel(overlay.kind, overlay.excerpt)} />
      ) : null}
      {marks.map((mark) => (
        <UnaddressedMark
          key={mark.partId}
          count={mark.count}
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
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setLocked(null)
        }}
        onSend={send}
        onAddress={(id) => void address(id)}
      />
      <CommentToggle enabled={enabled} onToggle={() => void toggleMode()} />
    </>
  )
}

const mount = document.createElement('div')
mount.id = 'plan-selector-root'
document.body.append(mount)
createRoot(mount).render(<PlanSelector />)
