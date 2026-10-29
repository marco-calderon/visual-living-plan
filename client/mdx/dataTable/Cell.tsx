import type { ReactNode } from 'react'
import { markPart } from './model.tsx'

type CellProps = {
  value?: string | number
  children?: ReactNode
}

function CellTag(_props: CellProps) {
  return null
}

export const Cell = markPart(CellTag, 'cell')
