import { useEffect, useRef, useState, type ReactNode } from 'react'
import { RadioGroup } from '../ui/radio-group.tsx'
import { Box } from './Box'
import { CardLabel, type CardIcon } from './CardLabel'
import { ChoiceContext } from './entryContext'
import { Option } from './Option'
import { anchorId, keyedEntries, partitionEntries } from './planEntry'
import { cx } from './styles'
import type { ChoiceOptionSpec, ChoiceResponse } from './types'
import { VStack } from './VStack'

export type ChoiceProps = {
  id: string
  prompt: string
  options?: ChoiceOptionSpec[]
  selectedId?: string
  selectedLabel?: string
  locked?: boolean
  /** What the card says while locked. The page's default is that a run is going on. */
  lockedState?: string
  children?: ReactNode
  className?: string
  /** Icon name or element shown in a square before the card label. */
  icon?: CardIcon
  /** Tints the icon square: blue, green, orange, red, pink, or purple. */
  color?: string
  onSelect?: (response: ChoiceResponse) => void
}

export function Choice({
  id,
  prompt,
  options,
  selectedId,
  selectedLabel: savedLabel,
  locked,
  lockedState,
  children,
  className,
  icon,
  color,
  onSelect,
}: ChoiceProps) {
  const [localSelected, setLocalSelected] = useState<{ id: string; label: string } | undefined>(undefined)
  const labels = useRef(new Map<string, string>())
  // The latest pick shows until the saved answer catches up. A different saved answer, from another tab, wins after that.
  const selected = localSelected?.id ?? selectedId
  const selectedLabel =
    localSelected && localSelected.id === selected ? localSelected.label : (savedLabel ?? selected)
  // A choice stays open: picking another option replaces the answer. Only a live run locks it.
  const disabled = Boolean(locked)
  const { matches, rest } = partitionEntries(children, 'option')

  useEffect(() => {
    if (localSelected && selectedId === localSelected.id) setLocalSelected(undefined)
  }, [selectedId, localSelected])

  function select(optionId: string, label: string) {
    if (locked || optionId === selected) return
    setLocalSelected({ id: optionId, label })
    onSelect?.({ kind: 'choice', id, optionId, label })
  }

  const state = locked
    ? (lockedState ?? 'Locked during execution')
    : selected
      ? 'selected'
      : 'Waiting for a selection'
  const promptId = `${anchorId(id)}-prompt`

  return (
    <Box
      as="section"
      surface="plain"
      className={cx('plan-entry', 'plan-choice', className)}
      id={anchorId(id)}
      data-entry="choice"
      data-entry-id={id}
      data-locked={locked ? 'true' : undefined}
    >
      <VStack gap="sm">
        <CardLabel icon={icon} color={color}>Needs your choice</CardLabel>
        <h3 className="plan-title" id={promptId}>
          {prompt}
        </h3>
        {rest.length > 0 ? <div className="plan-rich">{rest}</div> : null}
        <ChoiceContext.Provider
          value={{
            choiceId: id,
            selectedId: selected,
            disabled,
            onSelect: select,
            remember: (optionId, label) => {
              labels.current.set(optionId, label)
            },
          }}
        >
          <RadioGroup
            className="plan-choice-group"
            name={id}
            value={selected ?? ''}
            disabled={disabled}
            aria-labelledby={promptId}
            onValueChange={(optionId) => {
              select(optionId, labels.current.get(optionId) ?? optionId)
            }}
          >
            {options?.map((option) => (
              <Option key={option.id} id={option.id} label={option.label}>
                {option.description}
              </Option>
            ))}
            {keyedEntries(matches, 'option')}
          </RadioGroup>
        </ChoiceContext.Provider>
        <p className="plan-state" data-state-for={id}>
          {state === 'selected' ? (
            <>
              Selected: <strong>{selectedLabel}</strong>
            </>
          ) : (
            state
          )}
        </p>
      </VStack>
    </Box>
  )
}
