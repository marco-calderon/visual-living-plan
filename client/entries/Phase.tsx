import type { ReactNode } from 'react'
import { Box } from './Box'
import { HStack } from './HStack'
import { anchorId } from './planEntry'
import { cx } from './styles'
import { phaseStatus } from './types'
import { VStack } from './VStack'

export type PhaseProps = {
  id?: string
  title: string
  status?: string
  children?: ReactNode
  className?: string
}

export function Phase({ id, title, status, children, className }: PhaseProps) {
  const normalized = phaseStatus(status)
  return (
    <Box
      as="section"
      surface="panel"
      className={cx('plan-entry', 'plan-phase', className)}
      id={anchorId(id)}
      data-entry="phase"
      data-entry-id={id}
      data-status={normalized}
    >
      <HStack gap="md" align="stretch">
        <Box className="plan-phase-rail" padding="none" aria-hidden="true" />
        <VStack gap="sm" className="plan-phase-body">
          <HStack gap="sm" align="baseline" wrap>
            <span className="plan-phase-status">{normalized}</span>
            <h3 className="plan-title">{title}</h3>
          </HStack>
          {children ? <div className="plan-rich">{children}</div> : null}
        </VStack>
      </HStack>
    </Box>
  )
}
