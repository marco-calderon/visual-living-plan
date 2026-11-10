import type { ReactNode } from 'react'
import { Field as UiField } from './Field'
import { Item as UiItem } from './Item'
import { markEntry } from './planEntry'

/*
 * A plan file's <field> and <item> props arrive as strings (options="a, b", required="true").
 * These read them into the entries' props. The page and the editor's locked cards both use them.
 */

type MdxFieldProps = {
  name: string
  label: string
  type?: string
  required?: boolean | string
  default?: string | number
  options?: string[] | string
  placeholder?: string
  min?: number | string
  max?: number | string
  step?: number | string
  children?: ReactNode
  className?: string
}

function numericProp(value: number | string | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return undefined
}

function MdxField({ options, required, min, max, step, ...props }: MdxFieldProps) {
  const list = Array.isArray(options)
    ? options
    : typeof options === 'string'
      ? options
          .split(',')
          .map((option) => option.trim())
          .filter(Boolean)
      : undefined
  const isRequired = required === true || required === 'true' || required === ''
  const minimum = numericProp(min)
  const maximum = numericProp(max)
  const stride = numericProp(step)
  return (
    <UiField
      {...props}
      options={list}
      required={isRequired}
      min={minimum}
      max={maximum}
      step={stride}
    />
  )
}

type MdxItemProps = {
  children?: ReactNode
  done?: boolean | string
  index?: number
  className?: string
}

function MdxItem({ done, ...props }: MdxItemProps) {
  if (done === undefined) return <UiItem {...props} />
  return <UiItem {...props} done={done === true || done === 'true'} />
}

/** <field> from a plan file. */
export const Field = markEntry(MdxField, 'field')
/** <item> from a plan file. */
export const Item = markEntry(MdxItem, 'item')

