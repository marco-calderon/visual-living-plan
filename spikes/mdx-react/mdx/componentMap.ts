import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ComponentType } from 'react'
import { Approve } from './Approve.tsx'
import { BarChart } from './BarChart.tsx'
import { Box } from './Box.tsx'
import { Callout } from './Callout.tsx'
import { Choice } from './Choice.tsx'
import { Checklist } from './Checklist.tsx'
import { Field } from './Field.tsx'
import { Form } from './Form.tsx'
import { Item } from './Item.tsx'
import { LineChart } from './LineChart.tsx'
import { Mermaid } from './Mermaid.tsx'
import { Option } from './Option.tsx'
import { Phase } from './Phase.tsx'
import { Questions } from './Questions.tsx'
import { Row } from './Row.tsx'
import { Stack } from './Stack.tsx'
import { Workflow } from './Workflow.tsx'

/** Names the plan vocabulary and the layout primitives share. */
export const PLAN_COMPONENT_NAMES = [
  'phase',
  'choice',
  'approve',
  'form',
  'questions',
  'checklist',
  'callout',
  'workflow',
  'Stack',
  'Row',
  'Box',
] as const

export type PlanComponentName = (typeof PLAN_COMPONENT_NAMES)[number]

export type MdxComponentMap = {
  phase: typeof Phase
  choice: typeof Choice
  approve: typeof Approve
  form: typeof Form
  questions: typeof Questions
  checklist: typeof Checklist
  callout: typeof Callout
  workflow: typeof Workflow
  Stack: typeof Stack
  Row: typeof Row
  Box: typeof Box
  option: typeof Option
  item: typeof Item
  field: typeof Field
  Mermaid: typeof Mermaid
  BarChart: typeof BarChart
  LineChart: typeof LineChart
}

const uiDirectory = fileURLToPath(new URL('../ui/', import.meta.url))

export function localMdxComponents(): MdxComponentMap {
  return {
    phase: Phase,
    choice: Choice,
    approve: Approve,
    form: Form,
    questions: Questions,
    checklist: Checklist,
    callout: Callout,
    workflow: Workflow,
    Stack,
    Row,
    Box,
    option: Option,
    item: Item,
    field: Field,
    Mermaid,
    BarChart,
    LineChart,
  }
}

/**
 * Plan primitives come from `spikes/mdx-react/ui` when that folder ships them.
 * Workflow stays the ELK layout in this folder. Charts and Mermaid are registered
 * here so shipped MDX can use them without importing JavaScript.
 */
export async function createMdxComponents(): Promise<MdxComponentMap> {
  const components = localMdxComponents()
  const provided = await loadUiComponents()
  for (const name of PLAN_COMPONENT_NAMES) {
    if (name === 'workflow') continue
    const candidate = provided[name]
    if (typeof candidate === 'function') {
      components[name] = candidate as MdxComponentMap[typeof name]
    }
  }
  return components
}

async function loadUiComponents(): Promise<Partial<Record<PlanComponentName, ComponentType>>> {
  if (!existsSync(uiDirectory) || !statSync(uiDirectory).isDirectory()) return {}
  const entries = ['index.ts', 'index.tsx', 'index.js', 'index.mjs']
  for (const entry of entries) {
    const file = join(uiDirectory, entry)
    if (!existsSync(file)) continue
    try {
      const loaded = (await import(pathToFileURL(file).href)) as Record<string, unknown>
      return pickComponents(loaded)
    } catch {
      return {}
    }
  }
  return {}
}

function pickComponents(loaded: Record<string, unknown>): Partial<Record<PlanComponentName, ComponentType>> {
  const bag = componentBag(loaded)
  const found: Partial<Record<PlanComponentName, ComponentType>> = {}
  for (const name of PLAN_COMPONENT_NAMES) {
    const candidate = bag[name]
    if (typeof candidate === 'function') found[name] = candidate as ComponentType
  }
  return found
}

function componentBag(loaded: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(loaded.mdxComponents)) return loaded.mdxComponents
  if (isRecord(loaded.components)) return loaded.components
  return loaded
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
