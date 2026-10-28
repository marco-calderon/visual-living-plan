import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Box } from './Box'
import { FormContext } from './entryContext'
import { Field } from './Field'
import { anchorId } from './planEntry'
import { cx } from './styles'
import type { FormFieldSpec, FormResponse } from './types'
import { VStack } from './VStack'

export type FormProps = {
  id: string
  prompt: string
  fields?: FormFieldSpec[]
  values?: Record<string, string | number>
  locked?: boolean
  children?: ReactNode
  className?: string
  onSubmit?: (response: FormResponse) => void
}

function readFormValues(form: HTMLFormElement): Record<string, string | number> {
  const values: Record<string, string | number> = {}
  for (const element of form.elements) {
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLTextAreaElement) &&
      !(element instanceof HTMLSelectElement)
    ) {
      continue
    }
    const isButton =
      element instanceof HTMLInputElement && (element.type === 'submit' || element.type === 'button')
    if (!element.name || isButton) continue
    const text = element.value
    if (element instanceof HTMLInputElement && element.type === 'number') {
      if (text === '') continue
      values[element.name] = Number(text)
      continue
    }
    values[element.name] = text
  }
  return values
}

export function Form({ id, prompt, fields, values, locked, children, className, onSubmit }: FormProps) {
  const [sent, setSent] = useState(false)
  const sentRef = useRef(false)
  const disabled = Boolean(locked || sent || values)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || sentRef.current) return
    sentRef.current = true
    const next = readFormValues(event.currentTarget)
    setSent(true)
    onSubmit?.({ kind: 'form', id, values: next })
  }

  const state = locked ? 'Locked during execution' : disabled ? 'Submitted' : 'Waiting for form values'

  return (
    <Box
      as="section"
      surface="panel"
      className={cx('plan-entry', 'plan-form', className)}
      id={anchorId(id)}
      data-entry="form"
      data-entry-id={id}
      data-locked={locked ? 'true' : undefined}
    >
      <form onSubmit={handleSubmit} data-form-id={id}>
        <FormContext.Provider value={{ disabled, values }}>
          <VStack gap="sm">
            <span className="plan-kicker">Needs input</span>
            <h3 className="plan-title">{prompt}</h3>
            {fields?.map((field) => (
              <Field key={field.name} {...field} />
            ))}
            {children}
            <div>
              <button type="submit" className="plan-btn plan-btn-primary" disabled={disabled}>
                Submit
              </button>
            </div>
            <p className="plan-state" data-state-for={id}>{state}</p>
          </VStack>
        </FormContext.Provider>
      </form>
    </Box>
  )
}
