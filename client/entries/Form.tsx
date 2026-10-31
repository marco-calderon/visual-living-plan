import { Pencil } from 'lucide-react'
import { Children, isValidElement, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '../ui/button.tsx'
import { Box } from './Box'
import { FormContext } from './entryContext'
import { Field } from './Field'
import { anchorId } from './planEntry'
import { cx } from './styles'
import { fieldType, type FormFieldSpec, type FormResponse, type FormValue } from './types'
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

const IMMEDIATE_FIELDS = new Set(['checkbox', 'stepper'])

function collectFieldTypes(node: ReactNode, types: string[]) {
  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return
    const props = child.props as { name?: unknown; type?: unknown; children?: ReactNode }
    if (typeof props.name === 'string' && props.name.trim()) {
      types.push(typeof props.type === 'string' ? props.type : '')
    }
    if (props.children) collectFieldTypes(props.children, types)
  })
}

function formIsImmediate(fields: FormFieldSpec[] | undefined, children: ReactNode): boolean {
  const types: string[] = []
  for (const field of fields ?? []) types.push(field.type ?? '')
  collectFieldTypes(children, types)
  if (types.length === 0) return false
  return types.every((type) => IMMEDIATE_FIELDS.has(fieldType(type)))
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

function checkboxProgress(form: HTMLFormElement): { checked: number; total: number } | null {
  const boxes = [...form.elements].filter(
    (element): element is HTMLInputElement =>
      element instanceof HTMLInputElement && element.type === 'checkbox' && element.name !== '',
  )
  if (boxes.length === 0) return null
  return { checked: boxes.filter((box) => box.checked).length, total: boxes.length }
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
  const [editing, setEditing] = useState(false)
  const [progress, setProgress] = useState<{ checked: number; total: number } | null>(null)
  const sentRef = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const pendingOverrides = useRef<Record<string, FormValue>>({})
  const commitQueued = useRef(false)
  const immediate = formIsImmediate(fields, children)
  const submitted = Boolean(sent || values)
  const disabled = Boolean(locked) || (!immediate && submitted && !editing)
  const titleId = `${anchorId(id) ?? id}-title`

  function syncProgress(form: HTMLFormElement) {
    const next = immediate ? checkboxProgress(form) : null
    setProgress((current) => {
      if (current?.checked === next?.checked && current?.total === next?.total) return current
      if (!current && !next) return current
      return next
    })
  }

  useLayoutEffect(() => {
    if (formRef.current) syncProgress(formRef.current)
  })

  function publish(overrides?: Record<string, FormValue>) {
    const form = formRef.current
    if (!form || locked) return
    const next = readFormValues(form)
    if (overrides) {
      for (const [key, value] of Object.entries(overrides)) next[key] = value
    }
    onSubmit?.({ kind: 'form', id, values: next })
    syncProgress(form)
  }

  function commit(overrides?: Record<string, FormValue>) {
    if (!immediate || locked) return
    if (overrides) Object.assign(pendingOverrides.current, overrides)
    if (commitQueued.current) return
    commitQueued.current = true
    queueMicrotask(() => {
      commitQueued.current = false
      const extra = pendingOverrides.current
      pendingOverrides.current = {}
      publish(extra)
    })
  }

  function startEdit() {
    if (locked) return
    sentRef.current = false
    setEditing(true)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (locked) return
    if (!immediate && (disabled || sentRef.current)) return
    const form = event.currentTarget
    if (!immediate) {
      const missing = firstEmptyRequiredCheckbox(form)
      if (missing) {
        missing.setCustomValidity('Choose at least one')
        missing.reportValidity()
        missing.setCustomValidity('')
        return
      }
      if (!form.reportValidity()) return
      sentRef.current = true
      setEditing(false)
      setSent(true)
    }
    publish()
  }

  const state = locked
    ? 'Locked during execution'
    : editing
      ? 'Editing'
      : submitted
        ? 'Submitted'
        : 'Waiting for form values'

  return (
    <Box
      as="section"
      surface="panel"
      className={cx('plan-entry', 'plan-form', immediate && 'plan-form-immediate', className)}
      id={anchorId(id)}
      data-entry="form"
      data-entry-id={id}
      data-submit={immediate ? 'auto' : 'explicit'}
      data-locked={locked ? 'true' : undefined}
    >
      <form ref={formRef} onSubmit={handleSubmit} data-form-id={id}>
        <FormContext.Provider value={{ disabled, values, prompt, titleId, immediate, commit }}>
          <VStack gap="sm">
            {immediate ? (
              <div className="plan-check-list-head">
                <h3 className="plan-title" id={titleId}>
                  {prompt}
                </h3>
                {progress ? (
                  <span className="plan-check-count" data-check-count>
                    {progress.checked}/{progress.total}
                  </span>
                ) : null}
              </div>
            ) : (
              <>
                <span className="plan-kicker">
                  {locked ? 'Locked' : editing ? 'Editing' : submitted ? 'Saved' : 'Needs input'}
                </span>
                <h3 className="plan-title">{prompt}</h3>
              </>
            )}
            {fields?.map((field) => (
              <Field key={field.name} {...field} />
            ))}
            {children}
            {immediate ? null : (
              <div className="plan-form-actions">
                {submitted && !editing ? (
                  <Button type="button" data-form-edit={id} onClick={startEdit} disabled={locked}>
                    <Pencil size={16} aria-hidden="true" />
                    Edit
                  </Button>
                ) : (
                  <Button type="submit" variant="primary" disabled={disabled}>
                    Submit
                  </Button>
                )}
              </div>
            )}
            {immediate ? null : (
              <p className="plan-state" data-state-for={id}>
                {state}
              </p>
            )}
          </VStack>
        </FormContext.Provider>
      </form>
    </Box>
  )
}
