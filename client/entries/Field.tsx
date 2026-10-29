import { useContext, useId, type ReactNode } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx'
import { FormContext } from './entryContext'
import { markEntry } from './planEntry'
import { cx } from './styles'
import { fieldType, type FormValue } from './types'
import { VStack } from './VStack'

export type FieldProps = {
  name: string
  label: string
  type?: string
  required?: boolean
  default?: string | number
  options?: string[]
  placeholder?: string
  children?: ReactNode
  className?: string
}

export function Field({
  name,
  label,
  type,
  required,
  default: defaultValue,
  options,
  placeholder,
  children,
  className,
}: FieldProps) {
  const form = useContext(FormContext)
  const inputId = useId()
  const kind = fieldType(type)
  const submitted = form?.values?.[name]
  const disabled = form?.disabled ?? false
  const initial = scalarValue(submitted, defaultValue)
  const valueProps = submitted !== undefined || initial !== '' ? { defaultValue: initial } : {}
  const labelText = `${label}${required ? ' *' : ''}`
  const choices = options ?? []

  if (kind === 'checkbox') {
    const selected = checkedOptions(choices, submitted, defaultValue)
    if (choices.length === 0) {
      return (
        <label className={cx('plan-field', 'plan-checkbox', className)} data-field={name} data-field-type="checkbox">
          <input
            type="checkbox"
            name={name}
            value="true"
            defaultChecked={selected.has('true')}
            required={required}
            disabled={disabled}
          />
          <span>{labelText}</span>
          {children}
        </label>
      )
    }
    return (
      <div
        className={cx('plan-field', className)}
        data-field={name}
        data-field-type="checkbox"
        data-checkbox-required={required ? 'true' : undefined}
      >
        <VStack gap="xs">
          <span id={inputId}>{labelText}</span>
          <div className="plan-checkbox-group" role="group" aria-labelledby={inputId}>
            {choices.map((option) => (
              <label key={option} className="plan-checkbox">
                <input
                  type="checkbox"
                  name={name}
                  value={option}
                  defaultChecked={selected.has(option)}
                  disabled={disabled}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
          {children}
        </VStack>
      </div>
    )
  }

  let control: ReactNode
  if (kind === 'textarea') {
    control = (
      <textarea
        id={inputId}
        name={name}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        {...valueProps}
      />
    )
  } else if (kind === 'select') {
    control = (
      <Select
        name={name}
        required={required}
        disabled={disabled}
        defaultValue={initial !== '' ? initial : undefined}
      >
        <SelectTrigger id={inputId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(options ?? []).map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  } else {
    control = (
      <input
        id={inputId}
        type={kind === 'number' ? 'number' : 'text'}
        name={name}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        {...valueProps}
      />
    )
  }

  return (
    <label className={cx('plan-field', className)} htmlFor={inputId} data-field={name}>
      <VStack gap="xs">
        <span>{labelText}</span>
        {control}
        {children}
      </VStack>
    </label>
  )
}

markEntry(Field, 'field')

function scalarValue(submitted: FormValue | undefined, fallback: string | number | undefined): string {
  if (typeof submitted === 'string' || typeof submitted === 'number') return String(submitted)
  if (fallback !== undefined) return String(fallback)
  return ''
}

function checkedOptions(
  options: string[],
  submitted: FormValue | undefined,
  fallback: string | number | undefined,
): Set<string> {
  if (Array.isArray(submitted)) return new Set(submitted.map((value) => String(value)))
  if (typeof submitted === 'string') return options.length === 0 ? booleanChoice(submitted) : splitList(submitted)
  if (submitted !== undefined) return new Set()
  if (typeof fallback === 'string') return options.length === 0 ? booleanChoice(fallback) : splitList(fallback)
  return new Set()
}

function booleanChoice(value: string): Set<string> {
  return value === 'true' ? new Set(['true']) : new Set()
}

function splitList(value: string): Set<string> {
  return new Set(
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  )
}
