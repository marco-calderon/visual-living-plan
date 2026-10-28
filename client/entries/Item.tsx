import { useContext, type ReactNode } from 'react'
import { ItemContext } from './entryContext'
import { HStack } from './HStack'
import { markEntry } from './planEntry'
import { cx } from './styles'
import { VStack } from './VStack'

export type ItemProps = {
  children?: ReactNode
  done?: boolean
  index?: number
  className?: string
}

export function Item({ children, done, index, className }: ItemProps) {
  const item = useContext(ItemContext)
  const position = index ?? 0

  if (item?.mode === 'checklist') {
    const complete = done === true
    return (
      <li className={cx('plan-check-item', complete && 'is-done', className)} data-index={position}>
        <HStack gap="sm" align="center">
          <span className="plan-check">{complete ? 'done' : 'todo'}</span>
          <span>{children}</span>
        </HStack>
      </li>
    )
  }

  if (item?.mode === 'questions') {
    const key = String(position)
    const existing = item.answers?.[key]
    return (
      <label className={cx('plan-field', className)} data-index={position}>
        <VStack gap="xs">
          <span>
            {position + 1}. {children}
          </span>
          <textarea
            name={key}
            placeholder="Your answer"
            disabled={item.disabled}
            defaultValue={existing ?? ''}
          />
        </VStack>
      </label>
    )
  }

  return <div className={cx('plan-item', className)}>{children}</div>
}

markEntry(Item, 'item')
