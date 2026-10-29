import { useRef, useState, type ReactNode } from 'react'
import { RadioGroup } from '../ui/radio-group.tsx'
import { Box } from './Box'
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
  children?: ReactNode
  className?: string
  onSelect?: (response: ChoiceResponse) => void
}

export function Choice({
  id,
  prompt,
  options,
  selectedId,
  selectedLabel: savedLabel,
  locked,
  children,
  className,
  onSelect,
}: ChoiceProps) {
  const [localSelected, setLocalSelected] = useState<{ id: string; label: string } | undefined>(undefined)
  const picked = useRef(false)
  const labels = useRef(new Map<string, string>())
  const selected = selectedId ?? localSelected?.id
  const selectedLabel =
    localSelected && localSelected.id === selected ? localSelected.label : (savedLabel ?? selected)
  const disabled = Boolean(locked) || selected !== undefined
  const { matches, rest } = partitionEntries(children, 'option')

  function select(optionId: string, label: string) {
    if (locked || selected !== undefined || picked.current) return
    picked.current = true
    setLocalSelected({ id: optionId, label })
    onSelect?.({ kind: 'choice', id, optionId, label })
  }

  const state = locked
    ? 'Locked during execution'
    : selected
      ? 'selected'
      : 'Waiting for a selection'
  const promptId = `${anchorId(id)}-prompt`

  return (
    <Box
      as="section"
      surface="panel"
      className={cx('plan-entry', 'plan-choice', className)}
      id={anchorId(id)}
      data-entry="choice"
      data-entry-id={id}
      data-locked={locked ? 'true' : undefined}
    >
      <VStack gap="sm">
        <span className="plan-kicker">Needs your choice</span>
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
