import type { ReactNode } from 'react'
import { Box } from './Box'
import { ItemContext } from './entryContext'
import { checkState, Item, type CheckState } from './Item'
import { anchorId, editLockAttr, indexItems, partitionEntries } from './planEntry'
import { cx } from './styles'
import type { ChecklistItemSpec } from './types'
import { VStack } from './VStack'

export type ChecklistProps = {
  id?: string
  title?: string
  items?: ChecklistItemSpec[]
  children?: ReactNode
  className?: string
  /** Edit lock (ADR 0039): the page shows no Edit pill and the editor keeps the block as written. */
  locked?: unknown
  /** Where the block is in the plan's MDX (src/planMdx/remarkBlockRanges.ts), for editing it in place. */
  'data-plan-block'?: string
}

/** Done lines over all lines, and one bar segment per line in the line's state. */
function Progress({ states }: { states: CheckState[] }) {
  if (states.length === 0) return null
  const done = states.filter((state) => state === 'done').length
  const label = `${done} of ${states.length} done`
  return (
    <>
      <span className="plan-checklist-count" title={label}>
        <span aria-hidden="true">
          {done}/{states.length}
        </span>
        <span className="plan-check-name">{label}</span>
      </span>
      <span className="plan-checklist-bar" aria-hidden="true">
        {states.map((state, index) => (
          <i key={index} data-state={state} />
        ))}
      </span>
    </>
  )
}

export function Checklist({ id, title, items, children, className, locked, 'data-plan-block': blockRange }: ChecklistProps) {
  const { matches, rest } = partitionEntries(children, 'item')
  const indexed = indexItems(matches, items?.length ?? 0)
  const states: CheckState[] = [
    ...(items ?? []).map((item) => checkState(item.status, item.done)),
    ...matches.map((element) => {
      const props = element.props as { status?: unknown; done?: unknown }
      return checkState(props.status, props.done)
    }),
  ]
  return (
    <Box
      as="section"
      surface="plain"
      className={cx('plan-entry', 'plan-checklist', className)}
      id={anchorId(id)}
      data-entry="checklist"
      data-edit-locked={editLockAttr(locked)}
      data-plan-block={blockRange}
      data-entry-id={id}
    >
      <ItemContext.Provider value={{ mode: 'checklist', disabled: true }}>
        <VStack gap="sm">
          <div className="plan-checklist-head">
            {title ? <h3 className="plan-title plan-checklist-title">{title}</h3> : null}
            <Progress states={states} />
          </div>
          <VStack as="ul" gap="sm" className="plan-checklist-items">
            {items?.map((item, index) => (
              <Item key={`item-${index}`} index={index} done={item.done} status={item.status}>
                {item.text}
              </Item>
            ))}
            {indexed}
          </VStack>
          {rest.length > 0 ? <div className="plan-rich">{rest}</div> : null}
        </VStack>
      </ItemContext.Provider>
    </Box>
  )
}
