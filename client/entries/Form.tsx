import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Box } from './Box'
import { FormContext } from './entryContext'
import { Field } from './Field'
import { anchorId } from './planEntry'
import { cx } from './styles'
import type { FormFieldSpec, FormResponse, FormValue } from './types'
import { VStack } from './VStack'

export type FormProps = {
  id: string
  prompt: string
  fields?: FormFieldSpec[]
  values?: Record<string, FormValue>
  locked?: boolean
  children?: ReactNode
  className?: string
  onSubmit?: (response: FormResponse) => void
}

function readFormValues(form: HTMLFormElement): Record<string, FormValue> {
  const values: Record<string, FormValue> = {}
  const checkboxNames = new Set<string>()
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
    if (element instanceof HTMLInputElement && element.type === 'checkbox') {
      checkboxNames.add(element.name)
      continue
    }
    const text = element.value
    if (element instanceof HTMLInputElement && element.type === 'number') {
      if (text === '') continue
      values[element.name] = Number(text)
      continue
    }
    values[element.name] = text
  }
  for (const name of checkboxNames) {
    const boxes = [...form.elements].filter(
      (element): element is HTMLInputElement =>
        element instanceof HTMLInputElement && element.type === 'checkbox' && element.name === name,
    )
    const checked = boxes.filter((box) => box.checked).map((box) => box.value)
    const singleBoolean = boxes.length === 1 && boxes[0]?.value === 'true'
    values[name] = singleBoolean ? (checked.length > 0 ? 'true' : 'false') : checked
  }
  return values
}

function firstEmptyRequiredCheckbox(form: HTMLFormElement): HTMLInputElement | null {
  for (const group of form.querySelectorAll('[data-checkbox-required="true"]')) {
    const name = group.getAttribute('data-field')
    if (!name) continue
    const boxes = [...form.elements].filter(
      (element): element is HTMLInputElement =>
        element instanceof HTMLInputElement && element.type === 'checkbox' && element.name === name,
    )
    if (boxes.some((box) => box.checked)) continue
    return boxes[0] ?? null
  }
  return null
}

export function Form({ id, prompt, fields, values, locked, children, className, onSubmit }: FormProps) {
  const [sent, setSent] = useState(false)
  const sentRef = useRef(false)
  const disabled = Boolean(locked || sent || values)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (disabled || sentRef.current) return
    const form = event.currentTarget
    const missing = firstEmptyRequiredCheckbox(form)
    if (missing) {
      missing.setCustomValidity('Choose at least one')
      missing.reportValidity()
      missing.setCustomValidity('')
      return
    }
    if (!form.reportValidity()) return
    sentRef.current = true
    const next = readFormValues(form)
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
