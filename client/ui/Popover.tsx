import type { ComponentProps } from 'react'
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'

export function Popover(props: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root {...props} />
}

export function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

type PopoverContentProps = PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Portal.Props, 'keepMounted'> &
  Pick<
    PopoverPrimitive.Positioner.Props,
    | 'align'
    | 'alignOffset'
    | 'side'
    | 'sideOffset'
    | 'anchor'
    | 'collisionAvoidance'
    | 'collisionPadding'
    | 'positionMethod'
  >

export function PopoverContent({
  align = 'center',
  alignOffset = 0,
  side = 'right',
  sideOffset = 8,
  anchor,
  collisionAvoidance,
  collisionPadding,
  positionMethod,
  keepMounted,
  className,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal keepMounted={keepMounted}>
      <PopoverPrimitive.Positioner
        data-plan-grab-ignore=""
        className="plan-popover-positioner"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        anchor={anchor}
        collisionAvoidance={collisionAvoidance}
        collisionPadding={collisionPadding}
        positionMethod={positionMethod}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          data-plan-grab-ignore=""
          className={className ? `plan-popover ${className}` : 'plan-popover'}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export function PopoverHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="popover-header"
      className={className ? `plan-popover-header ${className}` : 'plan-popover-header'}
      {...props}
    />
  )
}

export function PopoverTitle(props: PopoverPrimitive.Title.Props) {
  return <PopoverPrimitive.Title data-slot="popover-title" className="plan-popover-title" {...props} />
}

export function PopoverDescription(props: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className="plan-popover-description"
      {...props}
    />
  )
}
