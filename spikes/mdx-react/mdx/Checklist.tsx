import type { ReactNode } from 'react'

type ChecklistProps = {
  title?: string
  children?: ReactNode
}

export function Checklist({ title, children }: ChecklistProps) {
  return (
    <section className="vlp-checklist">
      {title ? <h3 style={{ marginBottom: 8 }}>{title}</h3> : null}
      <ul style={{ listStyle: 'none', padding: 0 }}>{children}</ul>
    </section>
  )
}
