import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '../ui/button.tsx'
import { Box } from './Box'
import { CardLabel, type CardIcon } from './CardLabel'
import { ItemContext } from './entryContext'
import { Item } from './Item'
import { anchorId, indexItems, partitionEntries } from './planEntry'
import { cx } from './styles'
import type { QuestionsResponse } from './types'
import { VStack } from './VStack'

export type QuestionsProps = {
  id: string
  prompt?: string
  items?: string[]
  answers?: Record<string, string>
  locked?: boolean
  children?: ReactNode
  className?: string
  /** Icon name or element shown in a square before the card label. */
  icon?: CardIcon
  /** Tints the icon square: blue, green, orange, red, pink, or purple. */
  color?: string
  onSubmit?: (response: QuestionsResponse) => void
}

function readAnswers(form: HTMLFormElement): Record<string, string> {
  const answers: Record<string, string> = {}
  for (const element of form.elements) {
    if (!(element instanceof HTMLTextAreaElement) && !(element instanceof HTMLInputElement)) continue
    if (!element.name) continue
    answers[element.name] = element.value
  }
  return answers
}

export function Questions({ id, prompt, items, answers, locked, children, className, icon, color, onSubmit }: QuestionsProps) {
  const [sent, setSent] = useState(false)
  const sentRef = useRef(false)
  const disabled = Boolean(locked || sent || answers)
  const { matches, rest } = partitionEntries(children, 'item')
  const indexed = indexItems(matches, items?.length ?? 0)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || sentRef.current) return
    sentRef.current = true
    setSent(true)
    onSubmit?.({ kind: 'questions', id, answers: readAnswers(event.currentTarget) })
  }

  const state = locked ? 'Locked during execution' : disabled ? 'Answers sent' : 'Waiting for answers'

  return (
    <Box
      as="section"
      surface="panel"
      className={cx('plan-entry', 'plan-questions', className)}
      id={anchorId(id)}
      data-entry="questions"
      data-entry-id={id}
      data-locked={locked ? 'true' : undefined}
    >
      <VStack gap="sm">
        <CardLabel icon={icon} color={color}>Open questions</CardLabel>
        <h3 className="plan-title">{prompt || 'Please answer'}</h3>
        {rest.length > 0 ? <div className="plan-rich">{rest}</div> : null}
        <ItemContext.Provider value={{ mode: 'questions', disabled, answers }}>
          <form onSubmit={handleSubmit} data-questions-id={id}>
            <VStack gap="sm">
              {items?.map((text, index) => (
                <Item key={`item-${index}`} index={index}>
                  {text}
                </Item>
              ))}
              {indexed}
              <div>
                <Button type="submit" variant="primary" disabled={disabled}>
                  Send answers
                </Button>
              </div>
              <p className="plan-state" data-state-for={id}>{state}</p>
            </VStack>
          </form>
        </ItemContext.Provider>
      </VStack>
    </Box>
  )
}
