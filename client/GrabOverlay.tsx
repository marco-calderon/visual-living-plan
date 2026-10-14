export type GrabOverlayProps = {
  rect: DOMRect
  label: string
}

export function GrabOverlay({ rect, label }: GrabOverlayProps) {
  return (
    <div
      data-plan-grab-ignore=""
      className="plan-grab-overlay"
      style={{
        left: rect.left,
        top: rect.top,
        width: Math.max(rect.width, 8),
        height: Math.max(rect.height, 8),
      }}
    >
      <span className="plan-grab-label">{label}</span>
    </div>
  )
}
