import type { ReactNode } from 'react'

type QuestionsProps = {
  id?: string
  prompt?: string
  children?: ReactNode
}

export function Questions({ id, prompt, children }: QuestionsProps) {
  return (
    <section id={id} className="vlp-questions">
      {prompt ? <p>{prompt}</p> : null}
      <ol>{children}</ol>
    </section>
  )
}
