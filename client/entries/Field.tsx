import { useContext, useId, type ReactNode } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx'
import { FormContext } from './entryContext'
import { markEntry } from './planEntry'
import { cx } from './styles'
import { fieldType } from './types'
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
  const initial = submitted !== undefined ? String(submitted) : defaultValue !== undefined ? String(defaultValue) : ''
  const valueProps = submitted !== undefined || initial !== '' ? { defaultValue: initial } : {}
  const labelText = `${label}${required ? ' *' : ''}`

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
