import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ProgressIcon } from '../execution-canvas/adapters/reactFlow/ProgressIcon.tsx'
import { workflowStepHash } from '../../src/planRefNavigation.ts'
import { splitStepHeading } from '../../src/planStepHeading.ts'
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
  const parsed = splitStepHeading(title)
  const headingRef = useRef<HTMLDivElement>(null)
  const [ordinal, setOrdinal] = useState(1)

  useLayoutEffect(() => {
    const section = headingRef.current?.closest('[data-entry="phase"]')
    if (!(section instanceof HTMLElement)) return
    const phases = section.ownerDocument.querySelectorAll('[data-entry="phase"]')
    const index = Array.prototype.indexOf.call(phases, section)
    if (index >= 0) setOrdinal(index + 1)
  }, [title])

  const number = parsed.number ?? String(ordinal)
  const label = parsed.label
  const jump = id ? workflowStepHash(id) : undefined

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
          <div className="plan-step-heading" ref={headingRef}>
            {jump ? (
              <a
                className="plan-step-number"
                href={jump}
                data-workflow-jump={id}
                aria-label={`Step ${number}`}
                title="Show on the workflow diagram"
              >
                {number}
              </a>
            ) : (
              <span className="plan-step-number" aria-label={`Step ${number}`}>
                {number}
              </span>
            )}
            <div className="plan-step-copy">
              <h3 className="plan-title">
                {jump ? (
                  <a className="plan-step-label" href={jump} data-workflow-jump={id}>
                    {label}
                  </a>
                ) : (
                  label
                )}
              </h3>
              <span className="plan-phase-status">
                {normalized === 'active' ? <ProgressIcon /> : null}
                {normalized}
              </span>
            </div>
          </div>
          {children ? <div className="plan-rich">{children}</div> : null}
        </VStack>
      </HStack>
    </Box>
  )
}
