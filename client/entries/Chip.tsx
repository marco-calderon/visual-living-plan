import type { ReactNode } from 'react'
import { cx } from './styles'

export type ChipProps = {
  children?: ReactNode
  className?: string
}

export function Chip({ children, className }: ChipProps) {
  return <span className={cx('plan-chip', className)}>{children}</span>
}
