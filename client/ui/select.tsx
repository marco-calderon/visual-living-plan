import { Check, ChevronDown } from 'lucide-react'
import { Select as SelectPrimitive } from '@base-ui/react/select'

export function Select(props: SelectPrimitive.Root.Props<string, false>) {
  return <SelectPrimitive.Root data-slot="select" modal={false} {...props} />
}

export function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={className ? `plan-select-trigger ${className}` : 'plan-select-trigger'}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="plan-select-icon" aria-hidden="true">
        <ChevronDown size={16} />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectValue(props: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

type SelectContentProps = SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>

export function SelectContent({
  align = 'start',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 6,
  className,
  ...props
}: SelectContentProps) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        data-plan-grab-ignore=""
        className="plan-select-positioner"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        positionMethod="fixed"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-plan-grab-ignore=""
          className={className ? `plan-select-popup ${className}` : 'plan-select-popup'}
          {...props}
        />
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={className ? `plan-select-item ${className}` : 'plan-select-item'}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="plan-select-indicator">
        <Check size={14} aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}
