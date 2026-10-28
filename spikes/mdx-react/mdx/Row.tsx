import { Fragment, type ReactNode } from 'react'

type RowProps = {
  children?: ReactNode
  gap?: number | string
}

/**
 * Children get a real column width. `min-width: 0` on a flex item lets a size
 * container collapse, and the two panels then paint on top of each other.
 * `min(100%, 16rem)` keeps the text readable and lets a narrow row wrap.
 */
const rowLayout = `
.vlp-row {
  width: 100%;
  min-width: 0;
  gap: var(--space-xl);
}
.vlp-row > * {
  flex: 1 1 16rem;
  min-width: min(100%, 16rem);
  max-width: 100%;
  box-sizing: border-box;
}
`

export function Row({ children, gap }: RowProps) {
  return (
    <Fragment>
      <style href="vlp-row" precedence="default">
        {rowLayout}
      </style>
      <div
        className="vlp-row"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'stretch',
          width: '100%',
          ...(gap != null ? { gap } : {}),
        }}
      >
        {children}
      </div>
    </Fragment>
  )
}
