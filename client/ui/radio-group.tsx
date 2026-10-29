import { Radio as RadioPrimitive } from '@base-ui/react/radio'
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'

export function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props<string>) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={className ? `plan-radio-group ${className}` : 'plan-radio-group'}
      {...props}
    />
  )
}

export function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props<string>) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={className ? `plan-radio ${className}` : 'plan-radio'}
      {...props}
    >
      <RadioPrimitive.Indicator data-slot="radio-group-indicator" className="plan-radio-indicator" />
    </RadioPrimitive.Root>
  )
}
