import type { ComponentProps } from 'react'

export type TextareaProps = ComponentProps<'textarea'>

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      className={className ? `plan-textarea ${className}` : 'plan-textarea'}
      {...props}
    />
  )
}
