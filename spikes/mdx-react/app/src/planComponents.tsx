import type { ReactNode } from 'react'
import { BarChart } from '../../mdx/BarChart'
import { LineChart } from '../../mdx/LineChart'
import { Mermaid } from '../../mdx/Mermaid'
import { Row } from '../../mdx/Row'
import { Stack } from '../../mdx/Stack'
import { Workflow as ElkWorkflow } from '../../mdx/Workflow'
import { components as uiComponents, Field as UiField, Item as UiItem } from '../../ui'
import { markEntry } from '../../ui/planEntry'

type MdxFieldProps = {
  name: string
  label: string
  type?: string
  required?: boolean | string
  default?: string | number
  options?: string[] | string
  placeholder?: string
  children?: ReactNode
  className?: string
}

function MdxField({ options, required, ...props }: MdxFieldProps) {
  const list = Array.isArray(options)
    ? options
    : typeof options === 'string'
      ? options
          .split(',')
          .map((option) => option.trim())
          .filter(Boolean)
      : undefined
  const isRequired = required === true || required === 'true' || required === ''
  return <UiField {...props} options={list} required={isRequired} />
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
 * UI plan entries, with the MDX package's ELK workflow, Pele mermaid, and TanStack charts.
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
