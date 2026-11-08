import { Check } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'
import { StatusIcon, statusLabel } from '../execution-canvas/adapters/reactFlow/StatusIcon.tsx'
import type { PhaseStatus } from '../entries/types.ts'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/Popover.tsx'

export const PHASE_STATUS_CHOICES: readonly PhaseStatus[] = ['pending', 'active', 'blocked', 'done', 'failed']

/** Arrow keys, Home, and End move focus between the statuses. */
function moveInList(event: KeyboardEvent<HTMLElement>) {
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
  if (at < 0) return
  const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, Home: -at, End: buttons.length - 1 - at }
  const delta = step[event.key]
  if (delta === undefined) return
  event.preventDefault()
  buttons[(at + delta + buttons.length) % buttons.length]?.focus()
}

/**
 * A phase's status icon, as a button. It opens a short list of statuses, each with its icon;
 * a pick sets the status and closes the list.
 */
export function StatusPicker({ status, onChange }: { status: PhaseStatus; onChange: (next: PhaseStatus) => void }) {
  const [open, setOpen] = useState(false)
  const picked = useRef<HTMLButtonElement>(null)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="plan-phase-status plan-editor-status plan-editor-status-button"
        data-status={status}
        data-status-picker=""
        aria-label={`Status ${statusLabel(status)}. Change status`}
        title="Change status"
      >
        <StatusIcon status={status} />
      </PopoverTrigger>
      <PopoverContent
        className="plan-status-popover"
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={12}
        initialFocus={picked}
        data-status-picker-popup=""
      >
        <div className="plan-status-list" role="group" aria-label="Status" onKeyDown={moveInList}>
          {PHASE_STATUS_CHOICES.map((choice) => (
            <button
              key={choice}
              ref={choice === status ? picked : undefined}
              type="button"
              className="plan-status-option"
              data-status={choice}
              data-status-option={choice}
              aria-pressed={choice === status}
              tabIndex={choice === status ? 0 : -1}
              onClick={() => {
                onChange(choice)
                setOpen(false)
              }}
            >
              <span className="plan-status-option-icon" aria-hidden="true">
                <StatusIcon status={choice} />
              </span>
              <span className="plan-status-option-label">{statusLabel(choice)}</span>
              {choice === status ? <Check size={14} strokeWidth={2.25} className="plan-status-option-check" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
