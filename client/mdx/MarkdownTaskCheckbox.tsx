import { Check } from 'lucide-react'
import type { ComponentProps } from 'react'

/**
 * The box at the start of a markdown task list item (`- [ ]`, `- [x]`).
 * It has the form checkbox's look but is read-only: the agent ticks it in the plan file.
 * Markdown makes no other input, so anything else stays a plain input.
 */
export function MarkdownTaskCheckbox(props: ComponentProps<'input'>) {
  if (props.type !== 'checkbox') return <input {...props} />
  const done = Boolean(props.checked)
  return (
    <span
      role="checkbox"
      aria-checked={done}
      aria-readonly="true"
      className="plan-checkbox-control plan-task-checkbox"
      data-checked={done ? '' : undefined}
      data-unchecked={done ? undefined : ''}
    >
      {done ? (
        <span className="plan-checkbox-indicator">
          <Check size={14} strokeWidth={2.5} aria-hidden="true" />
        </span>
      ) : null}
    </span>
  )
}
