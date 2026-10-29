import { Switch as SwitchPrimitive } from '@base-ui/react/switch'

type SwitchProps = SwitchPrimitive.Root.Props & {
  size?: 'sm' | 'default'
}

export function Switch({ className, size = 'default', ...props }: SwitchProps) {
  const classes = className ? `plan-switch ${className}` : 'plan-switch'
  return (
    <SwitchPrimitive.Root data-slot="switch" data-size={size} className={classes} {...props}>
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className="plan-switch-thumb" />
    </SwitchPrimitive.Root>
  )
}
