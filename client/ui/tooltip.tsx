import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'
import './tooltip.css'

/** Shared hover delay. Focus opens immediately. A second tooltip in the group opens immediately. */
export function TooltipProvider({ delay = 800, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider delay={delay} data-slot="tooltip-provider" {...props} />
}

export function Tooltip(props: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

export function TooltipTrigger(props: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

type TooltipContentProps = TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>

export function TooltipContent({
  align = 'center',
  alignOffset = 0,
  side = 'top',
  sideOffset = 6,
  className,
  children,
  ...props
}: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        className="plan-tooltip-positioner"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={className ? `plan-tooltip ${className}` : 'plan-tooltip'}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}
