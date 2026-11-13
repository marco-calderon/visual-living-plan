import { useContext, useId, type ReactNode } from 'react'
import { RadioGroupItem } from '../ui/radio-group.tsx'
import { ChoiceContext } from './entryContext'
import { markEntry } from './planEntry'
import { cx } from './styles'

export type OptionProps = {
  id: string
  label: string
  /** Bare `recommended` marks the option the agent suggests. It does not preselect it. */
  recommended?: boolean | string
  children?: ReactNode
  className?: string
}

export function Option({ id, label, recommended, children, className }: OptionProps) {
  const suggested = recommended === true || recommended === '' || recommended === 'true'
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
      data-recommended={suggested ? 'true' : undefined}
    >
      <div className="plan-choice-card-body">
        <RadioGroupItem value={id} id={inputId} />
        <div className="plan-choice-copy">
          <span className="plan-choice-label">
            {label}
            {suggested ? <span className="plan-recommended">Recommended</span> : null}
          </span>
          {children ? <div className="plan-choice-desc">{children}</div> : null}
        </div>
      </div>
    </label>
  )
}

markEntry(Option, 'option')
