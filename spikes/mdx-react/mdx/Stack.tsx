import type { ReactNode } from 'react'

type StackProps = {
  children?: ReactNode
  gap?: number | string
}

export function Stack({ children, gap = 16 }: StackProps) {
  return (
    <div className="vlp-stack" style={{ display: 'flex', flexDirection: 'column', gap }}>
      {children}
    </div>
  )
}
