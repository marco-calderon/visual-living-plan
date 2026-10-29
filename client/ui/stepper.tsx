import { NumberField } from '@base-ui/react/number-field'
import { Minus, Plus } from 'lucide-react'

type StepperProps = {
  name: string
  defaultValue?: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  required?: boolean
  inputId?: string
  onCommit?: (value: number | null) => void
}

export function Stepper({
  name,
  defaultValue,
  min,
  max,
  step = 1,
  disabled,
  required,
  inputId,
  onCommit,
}: StepperProps) {
  return (
    <NumberField.Root
      name={name}
      defaultValue={defaultValue}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      required={required}
      className="plan-stepper-control"
      onValueCommitted={(value) => onCommit?.(value)}
    >
      <NumberField.Group className="plan-stepper-group">
        <NumberField.Decrement className="plan-stepper-button">
          <Minus size={16} strokeWidth={2} aria-hidden="true" />
        </NumberField.Decrement>
        <NumberField.Input id={inputId} className="plan-stepper-value" />
        <NumberField.Increment className="plan-stepper-button">
          <Plus size={16} strokeWidth={2} aria-hidden="true" />
        </NumberField.Increment>
      </NumberField.Group>
    </NumberField.Root>
  )
}
