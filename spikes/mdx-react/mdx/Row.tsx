import type { ReactNode } from 'react'

type RowProps = {
  children?: ReactNode
  gap?: number | string
}

export function Row({ children, gap = 16 }: RowProps) {
  return (
    <div className="vlp-row" style={{ display: 'flex', flexWrap: 'wrap', gap, alignItems: 'stretch' }}>
      {children}
    </div>
  )
}
