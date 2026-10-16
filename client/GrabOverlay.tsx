import { useLayoutEffect, useRef } from 'react'

export type GrabPoint = {
  x: number
  y: number
}

export type GrabOverlayProps = {
  partId: string
  rect: DOMRect
  label: string
  enterFrom?: GrabPoint | null
  visible: boolean
  onExited: () => void
}

type Placed = {
  partId: string
  left: number
  top: number
  width: number
  height: number
}

const GLIDE_MS = 420
const FADE_MS = 280
const FADE = `opacity ${FADE_MS}ms ease`
const GLIDE = `left 420ms cubic-bezier(0.22, 1, 0.36, 1), top 420ms cubic-bezier(0.22, 1, 0.36, 1), width 420ms cubic-bezier(0.22, 1, 0.36, 1), height 420ms cubic-bezier(0.22, 1, 0.36, 1), ${FADE}`

function placeOf(partId: string, rect: DOMRect): Placed {
  return {
    partId,
    left: rect.left,
    top: rect.top,
    width: Math.max(rect.width, 8),
    height: Math.max(rect.height, 8),
  }
}

function sameBox(left: Placed, right: Placed): boolean {
  return (
    Math.abs(left.left - right.left) < 0.5 &&
    Math.abs(left.top - right.top) < 0.5 &&
    Math.abs(left.width - right.width) < 0.5 &&
    Math.abs(left.height - right.height) < 0.5
  )
}

export function GrabOverlay({ partId, rect, label, enterFrom, visible, onExited }: GrabOverlayProps) {
  const node = useRef<HTMLDivElement>(null)
  const placed = useRef<Placed | null>(null)
  const glidingUntil = useRef(0)
  const onExitedRef = useRef(onExited)
  onExitedRef.current = onExited

  useLayoutEffect(() => {
    const element = node.current
    if (!element) return
    const next = placeOf(partId, rect)
    const previous = placed.current
    if (previous && previous.partId === next.partId && sameBox(previous, next)) return

    const entering = previous === null
    const partChanged = previous !== null && previous.partId !== next.partId
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const gliding = performance.now() < glidingUntil.current
    if (entering && enterFrom && !reduce) {
      const size = 14
      element.style.transition = 'none'
      element.style.left = `${enterFrom.x - size / 2}px`
      element.style.top = `${enterFrom.y - size / 2}px`
      element.style.width = `${size}px`
      element.style.height = `${size}px`
      void element.getBoundingClientRect()
      element.style.transition = GLIDE
      glidingUntil.current = performance.now() + GLIDE_MS
    } else if (partChanged && !reduce) {
      element.style.transition = GLIDE
      void element.getBoundingClientRect()
      glidingUntil.current = performance.now() + GLIDE_MS
    } else if (!gliding) {
      element.style.transition = 'none'
    }
    element.style.left = `${next.left}px`
    element.style.top = `${next.top}px`
    element.style.width = `${next.width}px`
    element.style.height = `${next.height}px`
    placed.current = next
  }, [partId, rect, enterFrom])

  useLayoutEffect(() => {
    const element = node.current
    if (!element) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (visible) {
      element.style.opacity = '1'
      return
    }
    if (reduce) {
      element.style.opacity = '0'
      onExitedRef.current()
      return
    }
    const current = element.style.transition
    element.style.transition = !current || current === 'none' ? FADE : current.includes('opacity') ? current : `${current}, ${FADE}`
    element.style.opacity = '0'
    const onEnd = (event: TransitionEvent) => {
      if (event.propertyName !== 'opacity' || element.style.opacity !== '0') return
      onExitedRef.current()
    }
    element.addEventListener('transitionend', onEnd)
    return () => element.removeEventListener('transitionend', onEnd)
  }, [visible])

  return (
    <div ref={node} data-plan-grab-ignore="" className="plan-grab-overlay">
      <span className="plan-grab-label">{label}</span>
    </div>
  )
}
