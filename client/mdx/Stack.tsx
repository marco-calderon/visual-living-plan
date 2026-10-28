import type { ReactNode } from 'react'

type StackProps = {
  children?: ReactNode
  gap?: number | string
}

export function Stack({ children, gap }: StackProps) {
  return (
    <div
      className="vlp-stack"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        minWidth: 0,
        ...(gap != null ? { gap } : {}),
      }}
    >
      {children}
    </div>
  )
}
