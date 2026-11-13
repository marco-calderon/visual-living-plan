import type { ReactNode } from 'react'

type MarkdownTableProps = {
  children?: ReactNode
  /** Where the table is in the plan's MDX, for editing it in place (src/planMdx/remarkBlockRanges.ts). */
  'data-plan-block'?: string
}

/** The plan's pipe table. Same chrome as the static `.rich-table` markup. */
export function MarkdownTable({ children, 'data-plan-block': blockRange }: MarkdownTableProps) {
  return (
    <div className="rich-table" data-plan-block={blockRange}>
      <table>{children}</table>
    </div>
  )
}
