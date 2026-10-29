import type { ReactNode } from 'react'
import { markPart } from './model.tsx'

type ColumnProps = {
  id?: string
  header?: string
  filter?: boolean | string
  children?: ReactNode
}

function ColumnTag(_props: ColumnProps) {
  return null
}

export const Column = markPart(ColumnTag, 'column')
