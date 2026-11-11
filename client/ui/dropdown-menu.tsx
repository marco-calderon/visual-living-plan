import { Menu as MenuPrimitive } from '@base-ui/react/menu'

export function DropdownMenu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" modal={false} {...props} />
}

export function DropdownMenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

type DropdownMenuContentProps = MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>

export function DropdownMenuContent({
  align = 'end',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 8,
  className,
  ...props
}: DropdownMenuContentProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="plan-menu-positioner"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        positionMethod="fixed"
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={className ? `plan-menu-popup ${className}` : 'plan-menu-popup'}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

export function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={className ? `plan-menu-item ${className}` : 'plan-menu-item'}
      {...props}
    />
  )
}

export function DropdownMenuLinkItem({ className, ...props }: MenuPrimitive.LinkItem.Props) {
  return (
    <MenuPrimitive.LinkItem
      data-slot="dropdown-menu-item"
      className={className ? `plan-menu-item ${className}` : 'plan-menu-item'}
      closeOnClick
      {...props}
    />
  )
}

export function DropdownMenuSub(props: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
}

export function DropdownMenuSubTrigger({ className, ...props }: MenuPrimitive.SubmenuTrigger.Props) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      className={className ? `plan-menu-item ${className}` : 'plan-menu-item'}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={className ? `plan-menu-separator ${className}` : 'plan-menu-separator'}
      {...props}
    />
  )
}

export function DropdownMenuGroup(props: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

export function DropdownMenuGroupLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-group-label"
      className={className ? `plan-menu-group-label ${className}` : 'plan-menu-group-label'}
      {...props}
    />
  )
}
