import type { ReactNode } from 'react'
import { Checkbox as CheckboxControl } from '../../ui/checkbox.tsx'
import { markPart } from './model.tsx'

type CheckboxProps = {
  checked?: boolean | string
  defaultChecked?: boolean | string
  disabled?: boolean | string
  name?: string
  value?: string
  className?: string
  children?: ReactNode
}

function flag(value: boolean | string | undefined): boolean | undefined {
  if (value === undefined) return undefined
  if (value === true || value === '' || value === 'true') return true
  if (value === false || value === 'false') return false
  return undefined
}

function CheckboxField({ checked, defaultChecked, disabled, className, ...props }: CheckboxProps) {
  const isChecked = flag(checked)
  const isDefault = flag(defaultChecked)
  const isDisabled = flag(disabled)
  return (
    <CheckboxControl
      {...props}
      className={className}
      {...(isChecked === undefined ? {} : { checked: isChecked })}
      {...(isDefault === undefined ? {} : { defaultChecked: isDefault })}
      {...(isDisabled === undefined ? {} : { disabled: isDisabled })}
    />
  )
}

export const Checkbox = markPart(CheckboxField, 'checkbox')
