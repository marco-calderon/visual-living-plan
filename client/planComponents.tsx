import { BarChart } from './mdx/BarChart'
import { LineChart } from './mdx/LineChart'
import { Mermaid } from './mdx/Mermaid'
import { Row } from './mdx/Row'
import { Stack } from './mdx/Stack'
import { Workflow as ElkWorkflow } from './mdx/Workflow'
import { components as uiComponents } from './entries'
import { Field, Item } from './entries/mdxEntries'

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
