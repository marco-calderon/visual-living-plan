import type { CSSProperties } from 'react'

export type UnaddressedMarkProps = {
  count: number
  style: CSSProperties
  onClick: () => void
}

export function UnaddressedMark({ count, style, onClick }: UnaddressedMarkProps) {
  const label = count === 1 ? '1 unaddressed comment' : `${count} unaddressed comments`
  return (
    <button
      type="button"
      className="plan-grab-mark"
      data-plan-grab-ignore=""
      style={style}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
    >
      <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
        <path d="M2.5 3.5h11v7.2H8.4L5.2 13.5v-2.8H2.5v-7.2z" fill="currentColor" />
      </svg>
    </button>
  )
}
