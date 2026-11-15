import type { ReactNode } from 'react'
import { Box } from './Box'
import { CardLabel, type CardIcon } from './CardLabel'
import { anchorId, editLockAttr } from './planEntry'
import { cx } from './styles'
import { calloutKind } from './types'
import { VStack } from './VStack'

export type CalloutProps = {
  id?: string
  kind?: string
  title?: string
  /** Icon name or element shown in a square before the label. */
  icon?: CardIcon
  /** Tints the icon square: blue, green, orange, red, pink, or purple. */
  color?: string
  children?: ReactNode
  className?: string
  /** Edit lock (ADR 0039): the page shows no Edit pill and the editor keeps the block as written. */
  locked?: unknown
  /** Where the block is in the plan's MDX (src/planMdx/remarkBlockRanges.ts), for editing it in place. */
  'data-plan-block'?: string
}

export function Callout({ id, kind, title, icon, color, children, className, locked, 'data-plan-block': blockRange }: CalloutProps) {
  const normalized = calloutKind(kind)
  // The title's text is edited where it reads (client/titleEdit.ts); the kind before it is not.
  const label = title ? (
    <>
      {normalized} · <span data-plan-title="title">{title}</span>
    </>
  ) : (
    normalized
  )
  return (
    <Box
      as="section"
      surface="plain"
      className={cx('plan-entry', 'plan-callout', className)}
      id={anchorId(id)}
      data-entry="callout"
      data-edit-locked={editLockAttr(locked)}
      data-plan-block={blockRange}
      data-entry-id={id}
      data-kind={normalized}
    >
      <VStack gap="sm">
        <CardLabel
          icon={icon}
          color={color}
          className="plan-callout-label"
          data-plan-part={id ? `callout:${id}/label` : undefined}
          data-plan-kind="label"
        >
          {label}
        </CardLabel>
        {children ? <div className="plan-rich">{children}</div> : null}
      </VStack>
    </Box>
  )
}
