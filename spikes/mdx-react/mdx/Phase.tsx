import type { ReactNode } from 'react'

type PhaseProps = {
  id?: string
  title?: string
  status?: string
  children?: ReactNode
}

const statusColor: Record<string, string> = {
  pending: '#5b6b63',
  active: '#0f766e',
  blocked: '#b45309',
  done: '#166534',
  failed: '#b42318',
}

export function Phase({ id, title, status = 'pending', children }: PhaseProps) {
  const known = statusColor[status] ? status : 'pending'
  return (
    <section
      id={id}
      className="vlp-phase"
      data-status={known}
      style={{
        border: '1px solid rgba(20, 32, 27, 0.12)',
        borderRadius: 16,
        padding: '16px 18px',
        background: 'rgba(255, 255, 255, 0.86)',
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        {title ? <h2 style={{ margin: '0 0 8px', fontSize: '1.25rem' }}>{title}</h2> : null}
        <span style={{ color: statusColor[known], fontSize: 13, fontWeight: 600 }}>{known}</span>
      </header>
      <div>{children}</div>
    </section>
  )
}
