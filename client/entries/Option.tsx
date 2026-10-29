import { useContext, useId, type ReactNode } from 'react'
import { RadioGroupItem } from '../ui/radio-group.tsx'
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
  const inputId = useId()
  choice?.remember(id, label)
  return (
    <label
      className={cx('plan-choice-card', className)}
      htmlFor={inputId}
      data-option-id={id}
      data-option-label={label}
      data-choice-id={choice?.choiceId}
    >
      <div className="plan-choice-card-body">
        <div className="plan-choice-copy">
          <span className="plan-choice-label">{label}</span>
          {children ? <div className="plan-choice-desc">{children}</div> : null}
        </div>
        <RadioGroupItem value={id} id={inputId} />
      </div>
    </label>
  )
}

markEntry(Option, 'option')
