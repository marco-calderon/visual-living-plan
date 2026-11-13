import { Circle, CircleCheck, CirclePause, CircleX } from 'lucide-react'
import { useContext, type ReactNode } from 'react'
import { ItemContext } from './entryContext'
import { HStack } from './HStack'
import { markEntry } from './planEntry'
import { cx } from './styles'
import { VStack } from './VStack'

export type ItemProps = {
  children?: ReactNode
  done?: boolean | string
  /** pending | active | blocked | done | failed. Wins over `done`. */
  status?: string
  index?: number
  className?: string
}

/** A checklist line's state: `todo` until it is done, or what its `status` says. */
export type CheckState = 'todo' | 'active' | 'blocked' | 'done' | 'failed'

const CHECK_NAME: Record<CheckState, string> = {
  todo: 'To do',
  active: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  failed: 'Failed',
}

export function checkState(status: unknown, done: unknown): CheckState {
  const value = typeof status === 'string' ? status.trim().toLowerCase() : ''
  if (value === 'active' || value === 'in-progress' || value === 'doing') return 'active'
  if (value === 'blocked') return 'blocked'
  if (value === 'failed') return 'failed'
  if (value === 'done' || value === 'complete' || value === 'completed') return 'done'
  if (value === 'pending' || value === 'todo') return 'todo'
  return done === true || done === 'true' ? 'done' : 'todo'
}

/** Half a ring filled: the same in-progress mark the plan's other status glyphs use. */
function HalfRing() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" className="plan-check-half">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 4a4 4 0 0 1 0 8z" fill="currentColor" />
    </svg>
  )
}

function ChecklistMark({ state }: { state: CheckState }) {
  const icon =
    state === 'done' ? (
      <CircleCheck size={16} strokeWidth={2.25} aria-hidden="true" />
    ) : state === 'active' ? (
      <HalfRing />
    ) : state === 'blocked' ? (
      <CirclePause size={16} strokeWidth={2.25} aria-hidden="true" />
    ) : state === 'failed' ? (
      <CircleX size={16} strokeWidth={2.25} aria-hidden="true" />
    ) : (
      <Circle size={16} strokeWidth={2.25} aria-hidden="true" />
    )
  return (
    <span className="plan-check" data-state={state}>
      {icon}
      <span className="plan-check-name">{CHECK_NAME[state]}</span>
    </span>
  )
}

export function Item({ children, done, status, index, className }: ItemProps) {
  const item = useContext(ItemContext)
  const position = index ?? 0

  if (item?.mode === 'checklist') {
    const state = checkState(status, done)
    return (
      <li className={cx('plan-check-item', state === 'done' && 'is-done', className)} data-index={position} data-state={state}>
        <HStack gap="sm" align="center">
          <ChecklistMark state={state} />
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
