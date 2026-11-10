import type { ReactNode } from 'react'
import { markPart } from './model.tsx'

type ColumnProps = {
  id?: string
  header?: string
  filter?: boolean | string
  search?: boolean | string
  sort?: boolean | string
  /** `wrap` for every cell in this column, such as `true` or `"40%"`. A cell can set its own. Short cells stay on one line. */
  wrap?: boolean | string | number
  children?: ReactNode
}

function ColumnTag(_props: ColumnProps) {
  return null
}

export const Column = markPart(ColumnTag, 'column')
