import type { ReactNode } from 'react'

type MarkdownTableProps = {
  children?: ReactNode
}

/** The plan's pipe table. Same chrome as the static `.rich-table` markup. */
export function MarkdownTable({ children }: MarkdownTableProps) {
  return (
    <div className="rich-table">
      <table>{children}</table>
    </div>
  )
}
