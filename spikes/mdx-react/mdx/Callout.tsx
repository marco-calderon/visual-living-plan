import type { ReactNode } from 'react'

type CalloutProps = {
  kind?: string
  title?: string
  children?: ReactNode
}

const kinds = new Set(['note', 'tip', 'risk', 'decision', 'warning'])

export function Callout({ kind = 'note', title, children }: CalloutProps) {
  const known = kinds.has(kind) ? kind : 'note'
  return (
    <aside
      className="vlp-callout"
      data-kind={known}
      style={{
        borderLeft: '3px solid #0f766e',
        padding: '8px 12px',
        margin: '12px 0',
        background: 'rgba(15, 118, 110, 0.08)',
      }}
    >
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </aside>
  )
}
