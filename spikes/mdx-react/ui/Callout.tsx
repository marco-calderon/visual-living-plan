import type { ReactNode } from 'react'
import { Box } from './Box'
import { anchorId } from './planEntry'
import { cx } from './styles'
import { calloutKind } from './types'
import { VStack } from './VStack'

export type CalloutProps = {
  id?: string
  kind?: string
  title?: string
  children?: ReactNode
  className?: string
}

export function Callout({ id, kind, title, children, className }: CalloutProps) {
  const normalized = calloutKind(kind)
  const label = title ? `${normalized} · ${title}` : normalized
  return (
    <Box
      as="section"
      surface="panel"
      className={cx('plan-entry', 'plan-callout', className)}
      id={anchorId(id)}
      data-entry="callout"
      data-entry-id={id}
      data-kind={normalized}
    >
      <VStack gap="sm">
        <div
          className="plan-callout-label"
          data-plan-part={id ? `callout:${id}/label` : undefined}
          data-plan-kind="label"
        >
          {label}
        </div>
        {children ? <div className="plan-rich">{children}</div> : null}
      </VStack>
    </Box>
  )
}
