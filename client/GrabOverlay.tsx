import { useLayoutEffect, useRef } from 'react'

export type GrabOverlayProps = {
  partId: string
  rect: DOMRect
  label: string
}

type Placed = {
  partId: string
  left: number
  top: number
  width: number
  height: number
}

const GLIDE =
  'left 240ms cubic-bezier(0.22, 1, 0.36, 1), top 240ms cubic-bezier(0.22, 1, 0.36, 1), width 240ms cubic-bezier(0.22, 1, 0.36, 1), height 240ms cubic-bezier(0.22, 1, 0.36, 1)'

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

export function GrabOverlay({ partId, rect, label }: GrabOverlayProps) {
  const node = useRef<HTMLDivElement>(null)
  const placed = useRef<Placed | null>(null)

  useLayoutEffect(() => {
    const element = node.current
    if (!element) return
    const next = placeOf(partId, rect)
    const previous = placed.current
    if (previous && previous.partId === next.partId && sameBox(previous, next)) return

    const partChanged = previous !== null && previous.partId !== next.partId
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    element.style.transition = partChanged && !reduce ? GLIDE : 'none'
    if (partChanged && !reduce) void element.getBoundingClientRect()
    element.style.left = `${next.left}px`
    element.style.top = `${next.top}px`
    element.style.width = `${next.width}px`
    element.style.height = `${next.height}px`
    placed.current = next
  }, [partId, rect])

  return (
    <div ref={node} data-plan-grab-ignore="" className="plan-grab-overlay">
      <span className="plan-grab-label">{label}</span>
    </div>
  )
}
