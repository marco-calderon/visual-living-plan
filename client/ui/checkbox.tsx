import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { Check } from 'lucide-react'

export function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={className ? `plan-checkbox-control ${className}` : 'plan-checkbox-control'}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="plan-checkbox-indicator">
        <Check size={14} strokeWidth={2.5} aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
