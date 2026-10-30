import type { ReactNode } from 'react'

type BubbleProps = {
  align?: 'start' | 'end'
  variant?: 'muted' | 'ghost'
  children: ReactNode
  className?: string
}

type BubbleContentProps = {
  children: ReactNode
  className?: string
}

export function Bubble({ align = 'start', variant = 'muted', children, className }: BubbleProps) {
  const classes = ['plan-bubble', `is-${variant}`, align === 'end' ? 'is-end' : 'is-start', className]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classes} data-align={align} data-variant={variant}>
      {children}
    </div>
  )
}

export function BubbleContent({ children, className }: BubbleContentProps) {
  return <div className={className ? `plan-bubble-content ${className}` : 'plan-bubble-content'}>{children}</div>
}
