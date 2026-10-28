import type { ReactNode } from 'react'

type ApproveProps = {
  id?: string
  prompt?: string
  children?: ReactNode
}

export function Approve({ id, prompt, children }: ApproveProps) {
  return (
    <section id={id} className="vlp-approve" style={{ padding: 12, borderRadius: 12, background: 'rgba(15, 118, 110, 0.08)' }}>
      {prompt ? <p>{prompt}</p> : null}
      <div>{children}</div>
      <button type="button">Approve</button> <button type="button">Deny</button>
    </section>
  )
}
