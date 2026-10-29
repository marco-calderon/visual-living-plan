import type { ReactNode } from 'react'
import { BarChart } from './mdx/BarChart'
import { LineChart } from './mdx/LineChart'
import { Mermaid } from './mdx/Mermaid'
import { Row } from './mdx/Row'
import { Stack } from './mdx/Stack'
import { Workflow as ElkWorkflow } from './mdx/Workflow'
import { components as uiComponents, Field as UiField, Item as UiItem } from './entries'
import { markEntry } from './entries/planEntry'

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

const Field = markEntry(MdxField, 'field')
const Item = markEntry(MdxItem, 'item')

/**
 * Plan entries for the page, plus the ELK workflow, Pele diagrams, and TanStack charts.
 * Lowercase keys are the tags in the plan source.
 */
export const planComponents = {
  ...uiComponents,
  field: Field,
  Field,
  item: Item,
  Item,
  workflow: ElkWorkflow,
  Workflow: ElkWorkflow,
  Stack,
  Row,
  Mermaid,
  BarChart,
  LineChart,
}
