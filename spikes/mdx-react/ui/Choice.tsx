import { useRef, useState, type ReactNode } from 'react'
import { Box } from './Box'
import { ChoiceContext } from './entryContext'
import { Option } from './Option'
import { anchorId, keyedEntries, partitionEntries } from './planEntry'
import { ResponsiveStack } from './ResponsiveStack'
import { cx } from './styles'
import type { ChoiceOptionSpec, ChoiceResponse } from './types'
import { VStack } from './VStack'

export type ChoiceProps = {
  id: string
  prompt: string
  options?: ChoiceOptionSpec[]
  selectedId?: string
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
  locked,
  children,
  className,
  onSelect,
}: ChoiceProps) {
  const [localSelected, setLocalSelected] = useState<string | undefined>(undefined)
  const picked = useRef(false)
  const selected = selectedId ?? localSelected
  const disabled = Boolean(locked) || selected !== undefined
  const { matches, rest } = partitionEntries(children, 'option')

  function select(optionId: string, label: string) {
    if (locked || selected !== undefined || picked.current) return
    picked.current = true
    setLocalSelected(optionId)
    onSelect?.({ kind: 'choice', id, optionId, label })
  }

  const state = locked
    ? 'Locked during execution'
    : selected
      ? 'selected'
      : 'Waiting for a selection'

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
        <h3 className="plan-title">{prompt}</h3>
        {rest.length > 0 ? <div className="plan-rich">{rest}</div> : null}
        <ChoiceContext.Provider value={{ choiceId: id, selectedId: selected, disabled, onSelect: select }}>
          <ResponsiveStack gap="sm">
            {options?.map((option) => (
              <Option key={option.id} id={option.id} label={option.label}>
                {option.description}
              </Option>
            ))}
            {keyedEntries(matches, 'option')}
          </ResponsiveStack>
        </ChoiceContext.Provider>
        <p className="plan-state">
          {state === 'selected' ? (
            <>
              Selected: <strong>{selected}</strong>
            </>
          ) : (
            state
          )}
        </p>
      </VStack>
    </Box>
  )
}
