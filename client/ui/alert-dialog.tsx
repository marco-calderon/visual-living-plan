import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog'
import type { ComponentProps } from 'react'
import { Button, type ButtonVariant } from './button.tsx'
import './alert-dialog.css'

function join(base: string, className?: string): string {
  return className ? `${base} ${className}` : base
}

/** shadcn/ui AlertDialog API on Base UI. A confirmation that the person must answer. */
export function AlertDialog(props: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

export function AlertDialogTrigger(props: AlertDialogPrimitive.Trigger.Props) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

export function AlertDialogContent({ className, children, ...props }: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop data-slot="alert-dialog-overlay" className="plan-alert-overlay" />
      <AlertDialogPrimitive.Popup data-slot="alert-dialog-content" className={join('plan-alert-content', className)} {...props}>
        {children}
      </AlertDialogPrimitive.Popup>
    </AlertDialogPrimitive.Portal>
  )
}

export function AlertDialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-dialog-header" className={join('plan-alert-header', className)} {...props} />
}

export function AlertDialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="alert-dialog-footer" className={join('plan-alert-footer', className)} {...props} />
}

export function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.Title.Props) {
  return <AlertDialogPrimitive.Title data-slot="alert-dialog-title" className={join('plan-alert-title', className)} {...props} />
}

export function AlertDialogDescription({ className, ...props }: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={join('plan-alert-description', className)}
      {...props}
    />
  )
}

type ActionProps = Omit<ComponentProps<typeof Button>, 'variant'> & { variant?: ButtonVariant }

/** The confirming button. It does not close the dialog by itself, so the caller can wait for the request. */
export function AlertDialogAction({ variant = 'primary', ...props }: ActionProps) {
  return <Button data-slot="alert-dialog-action" type="button" variant={variant} {...props} />
}

export function AlertDialogCancel({ variant = 'secondary', ...props }: ActionProps) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      render={<Button type="button" variant={variant} {...props} />}
    />
  )
}
