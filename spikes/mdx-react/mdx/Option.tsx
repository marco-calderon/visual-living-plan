import { useContext, type ReactNode } from 'react'
import { ChoiceGroup } from './Choice.tsx'

type OptionProps = {
  id?: string
  label?: string
  children?: ReactNode
}

export function Option({ id, label, children }: OptionProps) {
  const name = useContext(ChoiceGroup)
  return (
    <label className="vlp-option" style={{ display: 'block', margin: '8px 0' }}>
      <input type="radio" name={name} value={id} readOnly /> {label}
      {children ? <span style={{ display: 'block', marginLeft: 22, color: '#5b6b63' }}>{children}</span> : null}
    </label>
  )
}
