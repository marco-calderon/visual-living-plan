import type { ReactNode } from 'react'
import { markPart } from './model.tsx'

type RowProps = {
  children?: ReactNode
}

function RowTag(_props: RowProps) {
  return null
}

export const Row = markPart(RowTag, 'row')
