import { useContext, type ReactNode } from 'react'
import { ChoiceContext } from './entryContext'
import { markEntry } from './planEntry'
import { cx } from './styles'

export type OptionProps = {
  id: string
  label: string
  children?: ReactNode
  className?: string
}

export function Option({ id, label, children, className }: OptionProps) {
  const choice = useContext(ChoiceContext)
  const selected = choice?.selectedId === id
  return (
    <button
      type="button"
      className={cx('plan-choice-option', selected && 'is-selected', className)}
      aria-pressed={selected}
      disabled={choice?.disabled}
      data-option-id={id}
      data-option-label={label}
      data-choice-id={choice?.choiceId}
      onClick={() => choice?.onSelect(id, label)}
    >
      <span className="plan-choice-label">{label}</span>
      {children ? <span className="plan-choice-desc">{children}</span> : null}
    </button>
  )
}

markEntry(Option, 'option')
