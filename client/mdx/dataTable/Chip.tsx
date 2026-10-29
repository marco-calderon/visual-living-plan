import type { ReactNode } from 'react'

type ChipProps = {
  children?: ReactNode
  className?: string
}

export function Chip({ children, className }: ChipProps) {
  return <span className={className ? `plan-chip ${className}` : 'plan-chip'}>{children}</span>
}
