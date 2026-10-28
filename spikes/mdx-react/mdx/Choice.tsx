import { createContext, type ReactNode } from 'react'

type ChoiceProps = {
  id?: string
  prompt?: string
  children?: ReactNode
}

export const ChoiceGroup = createContext('choice')

export function Choice({ id, prompt, children }: ChoiceProps) {
  return (
    <ChoiceGroup.Provider value={id || 'choice'}>
      <fieldset id={id} className="vlp-choice" style={{ border: '1px solid rgba(20, 32, 27, 0.12)', borderRadius: 12, padding: 12 }}>
        {prompt ? <legend>{prompt}</legend> : null}
        {children}
      </fieldset>
    </ChoiceGroup.Provider>
  )
}
