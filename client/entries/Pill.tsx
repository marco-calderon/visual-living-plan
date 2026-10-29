import type { ReactNode } from 'react'
import { cx } from './styles'

export type PillTone = 'success' | 'warning' | 'danger' | 'neutral'

export type PillProps = {
  children?: ReactNode
  tone?: PillTone | string
  className?: string
}

const TONES = new Set<PillTone>(['success', 'warning', 'danger', 'neutral'])

export function Pill({ children, tone = 'neutral', className }: PillProps) {
  const name = typeof tone === 'string' && TONES.has(tone as PillTone) ? (tone as PillTone) : 'neutral'
  return (
    <span className={cx('plan-pill', className)} data-tone={name}>
      {children}
    </span>
  )
}
