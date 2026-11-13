import { useRef, useState, type ReactNode } from 'react'
import { Button } from '../ui/button.tsx'
import { Box } from './Box'
import { CardLabel, type CardIcon } from './CardLabel'
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
  /** What the card says while locked. The page's default is that a run is going on. */
  lockedState?: string
  className?: string
  /** Icon name or element shown in a square before the card label. */
  icon?: CardIcon
  /** Tints the icon square: blue, green, orange, red, pink, or purple. */
  color?: string
  onDecide?: (response: ApproveResponse) => void
}

export function Approve({ id, prompt, children, note, approved, locked, lockedState, className, icon, color, onDecide }: ApproveProps) {
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
    ? (lockedState ?? 'Locked during execution')
    : decision === true
      ? 'Approved'
      : decision === false
        ? 'Denied'
        : 'Waiting for approval'

  return (
    <Box
      as="section"
      surface="plain"
      className={cx('plan-entry', 'plan-approve', className)}
      id={anchorId(id)}
      data-entry="approve"
      data-entry-id={id}
      data-interaction-id={id}
      data-locked={locked ? 'true' : undefined}
    >
      <VStack gap="sm">
        <CardLabel icon={icon} color={color}>Approval gate</CardLabel>
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
          <Button
            type="button"
            variant="danger"
            disabled={disabled}
            data-approve-id={id}
            data-approved="false"
            onClick={() => decide(false)}
          >
            Deny
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={disabled}
            data-approve-id={id}
            data-approved="true"
            onClick={() => decide(true)}
          >
            Approve
          </Button>
        </HStack>
        <p className="plan-state" data-state-for={id}>{state}</p>
      </VStack>
    </Box>
  )
}
