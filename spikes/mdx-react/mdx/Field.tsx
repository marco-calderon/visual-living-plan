import type { ReactNode } from 'react'

type FieldProps = {
  name?: string
  label?: string
  type?: string
  options?: string
  default?: string
  required?: boolean | string
  placeholder?: string
  children?: ReactNode
}

export function Field({
  name,
  label,
  type = 'text',
  options = '',
  default: defaultValue,
  required,
  placeholder,
}: FieldProps) {
  const kind = type === 'number' || type === 'textarea' || type === 'select' ? type : 'text'
  const isRequired = required === true || required === 'true' || required === ''
  const controlStyle = { display: 'block', width: '100%', marginTop: 4, padding: 8 }
  return (
    <label className="vlp-field" style={{ display: 'block', margin: '10px 0' }}>
      {label ?? name}
      {kind === 'textarea' ? (
        <textarea name={name} required={isRequired} placeholder={placeholder} defaultValue={defaultValue} rows={3} style={controlStyle} />
      ) : null}
      {kind === 'select' ? (
        <select name={name} required={isRequired} defaultValue={defaultValue} style={controlStyle}>
          {options
            .split(',')
            .map((option) => option.trim())
            .filter(Boolean)
            .map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
        </select>
      ) : null}
      {kind === 'text' || kind === 'number' ? (
        <input
          name={name}
          type={kind}
          required={isRequired}
          placeholder={placeholder}
          defaultValue={defaultValue}
          style={controlStyle}
        />
      ) : null}
    </label>
  )
}
