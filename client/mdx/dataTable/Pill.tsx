import type { ReactNode } from 'react'

type PillProps = {
  children?: ReactNode
  tone?: string
  className?: string
}

const TONES = new Set(['success', 'warning', 'danger', 'neutral'])

export function Pill({ children, tone, className }: PillProps) {
  const name = typeof tone === 'string' && TONES.has(tone) ? tone : 'neutral'
  const classes = className ? `plan-pill ${className}` : 'plan-pill'
  return (
    <span className={classes} data-tone={name}>
      {children}
    </span>
  )
}
