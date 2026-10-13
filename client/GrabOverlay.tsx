export type GrabOverlayProps = {
  rect: DOMRect
  label: string
}

export function GrabOverlay({ rect, label }: GrabOverlayProps) {
  const above = rect.top > 28
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
      <span className={above ? 'plan-grab-label' : 'plan-grab-label is-inside'}>{label}</span>
    </div>
  )
}
