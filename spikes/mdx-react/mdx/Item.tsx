import type { ReactNode } from 'react'

type ItemProps = {
  done?: boolean | string
  children?: ReactNode
}

export function Item({ done, children }: ItemProps) {
  const checked = done === true || done === 'true'
  const interactive = done !== undefined
  return (
    <li className="vlp-item">
      {interactive ? <input type="checkbox" checked={checked} readOnly /> : null} {children}
    </li>
  )
}
