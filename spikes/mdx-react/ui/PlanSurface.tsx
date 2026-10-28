import type { ReactNode } from 'react'
import { cx } from './styles'
import { VStack } from './VStack'

export type PlanSurfaceProps = {
  children?: ReactNode
  className?: string
}

export function PlanSurface({ children, className }: PlanSurfaceProps) {
  return (
    <div className={cx('plan-ui', 'plan-surface', className)}>
      <VStack gap="md">{children}</VStack>
    </div>
  )
}
