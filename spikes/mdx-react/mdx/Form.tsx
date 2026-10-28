import type { FormEvent, ReactNode } from 'react'

type FormProps = {
  id?: string
  prompt?: string
  children?: ReactNode
}

export function Form({ id, prompt, children }: FormProps) {
  return (
    <form
      id={id}
      className="vlp-form"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
      }}
    >
      {prompt ? <p>{prompt}</p> : null}
      {children}
    </form>
  )
}
