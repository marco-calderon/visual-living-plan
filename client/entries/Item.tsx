import { Circle, CircleCheck } from 'lucide-react'
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

type ChecklistMarkProps = {
  done: boolean
}

function ChecklistMark({ done }: ChecklistMarkProps) {
  const Icon = done ? CircleCheck : Circle
  return (
    <span className="plan-check" data-state={done ? 'done' : 'todo'}>
      <Icon size={16} strokeWidth={2.25} aria-hidden="true" />
      <span className="plan-check-name">{done ? 'Done' : 'To do'}</span>
    </span>
  )
}

export function Item({ children, done, index, className }: ItemProps) {
  const item = useContext(ItemContext)
  const position = index ?? 0

  if (item?.mode === 'checklist') {
    const complete = done === true
    return (
      <li className={cx('plan-check-item', complete && 'is-done', className)} data-index={position}>
        <HStack gap="sm" align="center">
          <ChecklistMark done={complete} />
          <span className="plan-check-text">{children}</span>
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
          <span className="plan-question-line">
            <span className="plan-question-index">{position + 1}.</span>
            <span className="plan-question-text">{children}</span>
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
