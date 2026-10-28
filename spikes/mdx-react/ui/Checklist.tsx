import type { ReactNode } from 'react'
import { Box } from './Box'
import { ItemContext } from './entryContext'
import { Item } from './Item'
import { anchorId, indexItems, partitionEntries } from './planEntry'
import { cx } from './styles'
import type { ChecklistItemSpec } from './types'
import { VStack } from './VStack'

export type ChecklistProps = {
  id?: string
  title?: string
  items?: ChecklistItemSpec[]
  children?: ReactNode
  className?: string
}

export function Checklist({ id, title, items, children, className }: ChecklistProps) {
  const { matches, rest } = partitionEntries(children, 'item')
  const indexed = indexItems(matches, items?.length ?? 0)
  return (
    <Box
      as="section"
      surface="panel"
      className={cx('plan-entry', 'plan-checklist', className)}
      id={anchorId(id)}
      data-entry="checklist"
      data-entry-id={id}
    >
      <ItemContext.Provider value={{ mode: 'checklist', disabled: true }}>
        <VStack gap="sm">
          {title ? <h3 className="plan-title">{title}</h3> : null}
          <VStack as="ul" gap="sm" className="plan-checklist-items">
            {items?.map((item, index) => (
              <Item key={`item-${index}`} index={index} done={item.done}>
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
