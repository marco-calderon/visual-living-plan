import './primitives.css'
import { Approve } from './Approve'
import { Box } from './Box'
import { Callout } from './Callout'
import { Checklist } from './Checklist'
import { Chip } from './Chip'
import { Choice } from './Choice'
import { Field } from './Field'
import { Form } from './Form'
import { HStack } from './HStack'
import { Item } from './Item'
import { Option } from './Option'
import { Phase } from './Phase'
import { Pill } from './Pill'
import { PlanSurface } from './PlanSurface'
import { Questions } from './Questions'
import { ResponsiveStack } from './ResponsiveStack'
import { VStack } from './VStack'
import { Workflow } from './Workflow'
import { WorkflowStep } from './WorkflowStep'

export { Approve } from './Approve'
export { Box } from './Box'
export { Callout } from './Callout'
export { Checklist } from './Checklist'
export { Chip } from './Chip'
export { Choice } from './Choice'
export { Field } from './Field'
export { Form } from './Form'
export { HStack } from './HStack'
export { Item } from './Item'
export { Option } from './Option'
export { Phase } from './Phase'
export { Pill } from './Pill'
export { PlanSurface } from './PlanSurface'
export { Questions } from './Questions'
export { ResponsiveStack } from './ResponsiveStack'
export { VStack } from './VStack'
export { Workflow } from './Workflow'
export { WorkflowStep } from './WorkflowStep'

export type { ApproveProps } from './Approve'
export type { BoxPadding, BoxProps, BoxSurface } from './Box'
export type { CalloutProps } from './Callout'
export type { ChecklistProps } from './Checklist'
export type { ChipProps } from './Chip'
export type { ChoiceProps } from './Choice'
export type { FieldProps } from './Field'
export type { FormProps } from './Form'
export type { ItemProps } from './Item'
export type { OptionProps } from './Option'
export type { PhaseProps } from './Phase'
export type { PillProps, PillTone } from './Pill'
export type { PlanSurfaceProps } from './PlanSurface'
export type { QuestionsProps } from './Questions'
export type { Align, Gap, Justify, StackProps, StackTag } from './styles'
export type {
  ApproveResponse,
  CalloutKind,
  ChecklistItemSpec,
  ChoiceOptionSpec,
  ChoiceResponse,
  FieldType,
  FormFieldSpec,
  FormResponse,
  PhaseStatus,
  QuestionsResponse,
  WorkflowEdgeSpec,
  WorkflowNodeSpec,
} from './types'
export type { WorkflowProps } from './Workflow'
export type { WorkflowStepProps } from './WorkflowStep'
export { calloutKind, fieldType, phaseStatus } from './types'

/** Entry tags a plan file uses. Nested tags compose inside them. */
export const entryKinds = ['phase', 'callout', 'choice', 'approve', 'form', 'questions', 'checklist', 'workflow'] as const

export const nestedKinds = ['option', 'field', 'item', 'step'] as const

/**
 * Component map for an MDX (or other) renderer.
 * Lowercase keys match plan tag names. PascalCase keys match JSX component names.
 */
export const components = {
  phase: Phase,
  Phase,
  callout: Callout,
  Callout,
  choice: Choice,
  Choice,
  chip: Chip,
  Chip,
  pill: Pill,
  Pill,
  option: Option,
  Option,
  approve: Approve,
  Approve,
  form: Form,
  Form,
  field: Field,
  Field,
  questions: Questions,
  Questions,
  checklist: Checklist,
  Checklist,
  item: Item,
  Item,
  workflow: Workflow,
  Workflow,
  step: WorkflowStep,
  WorkflowStep,
  box: Box,
  Box,
  hstack: HStack,
  HStack,
  vstack: VStack,
  VStack,
  responsiveStack: ResponsiveStack,
  ResponsiveStack,
  PlanSurface,
} as const
