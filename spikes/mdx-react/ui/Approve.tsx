import { useRef, useState, type ReactNode } from 'react'
import { Box } from './Box'
import { HStack } from './HStack'
import { anchorId } from './planEntry'
import { cx } from './styles'
import type { ApproveResponse } from './types'
import { VStack } from './VStack'

export type ApproveProps = {
  id: string
  prompt: string
  children?: ReactNode
  note?: string
  approved?: boolean
  locked?: boolean
  className?: string
  onDecide?: (response: ApproveResponse) => void
}

export function Approve({ id, prompt, children, note, approved, locked, className, onDecide }: ApproveProps) {
  const [noteText, setNoteText] = useState(note ?? '')
  const [localDecision, setLocalDecision] = useState<boolean | undefined>(undefined)
  const picked = useRef(false)
  const decision = approved !== undefined ? approved : localDecision
  const disabled = Boolean(locked) || decision !== undefined

  function decide(next: boolean) {
    if (disabled || picked.current) return
    picked.current = true
    setLocalDecision(next)
    const trimmed = noteText.trim()
    onDecide?.({
      kind: 'approve',
      id,
      approved: next,
      ...(trimmed ? { note: trimmed } : {}),
    })
  }

  const state = locked
    ? 'Locked during execution'
    : decision === true
      ? 'Approved'
      : decision === false
        ? 'Denied'
        : 'Waiting for approval'

  return (
    <Box
      as="section"
      surface="panel"
      className={cx('plan-entry', 'plan-approve', className)}
      id={anchorId(id)}
      data-entry="approve"
      data-entry-id={id}
      data-locked={locked ? 'true' : undefined}
    >
      <VStack gap="sm">
        <span className="plan-kicker">Approval gate</span>
        <h3 className="plan-title">{prompt}</h3>
        {children ? <div className="plan-rich">{children}</div> : null}
        <label className="plan-field">
          <VStack gap="xs">
            <span>Optional note</span>
            <textarea
              value={noteText}
              placeholder="Direction for the agent"
              disabled={disabled}
              data-approve-note={id}
              onChange={(event) => setNoteText(event.target.value)}
            />
          </VStack>
        </label>
        <HStack gap="sm" wrap>
          <button
            type="button"
            className="plan-btn plan-btn-danger"
            disabled={disabled}
            data-approved="false"
            onClick={() => decide(false)}
          >
            Deny
          </button>
          <button
            type="button"
            className="plan-btn plan-btn-primary"
            disabled={disabled}
            data-approved="true"
            onClick={() => decide(true)}
          >
            Approve
          </button>
        </HStack>
        <p className="plan-state">{state}</p>
      </VStack>
    </Box>
  )
}
