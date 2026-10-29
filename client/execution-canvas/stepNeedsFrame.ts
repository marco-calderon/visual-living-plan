export type StepFrame = {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  zoom: number
  bounds: { top: number; left: number; right: number; bottom: number }
  pad?: number
}

/** Pan or zoom when the step is outside the canvas or too small to read. */
export function stepNeedsFrame(frame: StepFrame): boolean {
  const pad = frame.pad ?? 28
  const inView =
    frame.left >= frame.bounds.left + pad &&
    frame.top >= frame.bounds.top + pad &&
    frame.right <= frame.bounds.right - pad &&
    frame.bottom <= frame.bounds.bottom - pad
  const onScreenWidth = frame.right - frame.left
  const readable = frame.zoom >= 0.85 && onScreenWidth >= Math.min(frame.width, 180)
  return !inView || !readable
}
