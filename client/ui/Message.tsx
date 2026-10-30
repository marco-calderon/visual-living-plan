import type { ReactNode } from 'react'

type MessageProps = {
  align?: 'start' | 'end'
  children: ReactNode
  className?: string
}

type MessageSlotProps = {
  children: ReactNode
  className?: string
}

export function Message({ align = 'start', children, className }: MessageProps) {
  const classes = ['plan-message', align === 'end' ? 'is-end' : 'is-start', className].filter(Boolean).join(' ')
  return (
    <div className={classes} data-align={align}>
      {children}
    </div>
  )
}

export function MessageContent({ children, className }: MessageSlotProps) {
  return <div className={className ? `plan-message-content ${className}` : 'plan-message-content'}>{children}</div>
}

export function MessageFooter({ children, className }: MessageSlotProps) {
  return <div className={className ? `plan-message-footer ${className}` : 'plan-message-footer'}>{children}</div>
}
