import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { StatusIcon, statusLabel } from '../execution-canvas/adapters/reactFlow/StatusIcon.tsx'
import { workflowStepHash } from '../../src/planRefNavigation.ts'
import { splitStepHeading } from '../../src/planStepHeading.ts'
import { Box } from './Box'
import { HStack } from './HStack'
import { anchorId, editLockAttr } from './planEntry'
import { cx } from './styles'
import { phaseStatus } from './types'
import { VStack } from './VStack'

export type PhaseProps = {
  id?: string
  title: string
  status?: string
  children?: ReactNode
  className?: string
  /** Edit lock (ADR 0039): the page shows no Edit pill and the editor keeps the block as written. */
  locked?: unknown
  /** Where the block is in the plan's MDX (src/planMdx/remarkBlockRanges.ts), for editing it in place. */
  'data-plan-block'?: string
}

export function Phase({ id, title, status, children, className, locked, 'data-plan-block': blockRange }: PhaseProps) {
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
      surface="plain"
      className={cx('plan-entry', 'plan-phase', className)}
      id={anchorId(id)}
      data-entry="phase"
      data-entry-id={id}
      data-status={normalized}
      data-edit-locked={editLockAttr(locked)}
      data-plan-block={blockRange}
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
                <span className="plan-step-digit">{number}</span>
              </a>
            ) : (
              <span className="plan-step-number" aria-label={`Step ${number}`}>
                <span className="plan-step-digit">{number}</span>
              </span>
            )}
            <div className="plan-step-copy">
              <h3 className="plan-title">
                {/* The title's text is edited where it reads (client/titleEdit.ts); the number still jumps. */}
                {jump ? (
                  <a className="plan-step-label" href={jump} data-workflow-jump={id}>
                    <span data-plan-title="title">{label}</span>
                  </a>
                ) : (
                  <span data-plan-title="title">{label}</span>
                )}
                {/* A word joiner: the status glyph wraps with the title's last word, never alone. */}
                {'\u2060'}
                <span
                  className="plan-phase-status"
                  role="img"
                  aria-label={statusLabel(normalized)}
                  title={statusLabel(normalized)}
                >
                  <StatusIcon status={normalized} />
                </span>
              </h3>
            </div>
          </div>
          {children ? <div className="plan-rich">{children}</div> : null}
        </VStack>
      </HStack>
    </Box>
  )
}
