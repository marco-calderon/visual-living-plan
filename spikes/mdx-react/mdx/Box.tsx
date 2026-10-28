import type { ReactNode } from 'react'

type BoxProps = {
  children?: ReactNode
}

export function Box({ children }: BoxProps) {
  return (
    <div
      className="vlp-box"
      style={{
        flex: '1 1 16rem',
        minWidth: 0,
        padding: 12,
        border: '1px solid rgba(20, 32, 27, 0.12)',
        borderRadius: 12,
      }}
    >
      {children}
    </div>
  )
}
