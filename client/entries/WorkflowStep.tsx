import type { ReactNode } from 'react'
import { HStack } from './HStack'
import { markEntry } from './planEntry'
import { cx } from './styles'
import { VStack } from './VStack'

export type WorkflowStepProps = {
  id?: string
  label: string
  planRef?: string
  detail?: string
  status?: string
  href?: string
  children?: ReactNode
  className?: string
}

export function WorkflowStep({ id, label, planRef, detail, status, href, children, className }: WorkflowStepProps) {
  const ref = planRef ?? id
  const target = href ?? (ref ? `#plan-${ref}` : undefined)
  const body = (
    <HStack justify="between" align="baseline" wrap gap="sm">
      <VStack gap="xs">
        <span className="plan-workflow-label">{label}</span>
        {status ? <span className="plan-phase-status">{status}</span> : null}
        {detail ? <span className="plan-muted">{detail}</span> : null}
        {children}
      </VStack>
      {ref ? <span className="plan-workflow-ref">Plan · {ref}</span> : null}
    </HStack>
  )

  return (
    <li className={cx('plan-workflow-step', className)} data-step-id={id}>
      {target ? (
        <a href={target} data-plan-ref={ref}>
          {body}
        </a>
      ) : (
        body
      )}
    </li>
  )
}

markEntry(WorkflowStep, 'step')
