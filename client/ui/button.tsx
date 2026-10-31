import { Button as ButtonPrimitive } from '@base-ui/react/button'
import './button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger'

type ButtonProps = Omit<ButtonPrimitive.Props, 'className'> & {
  variant?: ButtonVariant
  className?: string
}

const VARIANT_CLASS: Record<ButtonVariant, string | undefined> = {
  primary: 'plan-btn-primary',
  secondary: 'plan-btn-secondary',
  tertiary: undefined,
  danger: 'plan-btn-danger',
}

/** Pill button. Compact padding is 8px 12px, from the plan button styles. */
export function Button({ variant = 'tertiary', className, ...props }: ButtonProps) {
  const classes = ['plan-btn', VARIANT_CLASS[variant], className].filter(Boolean).join(' ')
  return <ButtonPrimitive data-slot="button" className={classes} {...props} />
}
