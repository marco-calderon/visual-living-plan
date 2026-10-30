import type { ReactNode } from 'react'
import { markPart } from './model.tsx'

type CellProps = {
  value?: string | number
  /** `true` wraps the cell. A percentage, such as `"40%"` or `40`, wraps it inside that share of the table. */
  wrap?: boolean | string | number
  children?: ReactNode
}

function CellTag(_props: CellProps) {
  return null
}

export const Cell = markPart(CellTag, 'cell')
