export type PhaseStatus = 'pending' | 'active' | 'blocked' | 'done' | 'failed'

export type CalloutKind = 'note' | 'tip' | 'risk' | 'decision' | 'warning'

export type FieldType = 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'stepper'

export type FormValue = string | number | string[]

export type ChoiceOptionSpec = {
  id: string
  label: string
  description?: string
}

export type FormFieldSpec = {
  name: string
  label: string
  type?: FieldType | string
  required?: boolean
  default?: string | number
  options?: string[]
  placeholder?: string
  min?: number
  max?: number
  step?: number
}

export type ChecklistItemSpec = {
  text: string
  done?: boolean
}

export type WorkflowNodeSpec = {
  id: string
  label?: string
  detail?: string
  ref?: string
  status?: string
}

export type WorkflowEdgeSpec = {
  from: string
  to: string
  label?: string
  fromSide?: string
  toSide?: string
}

export type ChoiceResponse = {
  kind: 'choice'
  id: string
  optionId: string
  label: string
}

export type ApproveResponse = {
  kind: 'approve'
  id: string
  approved: boolean
  note?: string
}

export type FormResponse = {
  kind: 'form'
  id: string
  values: Record<string, FormValue>
}

export type QuestionsResponse = {
  kind: 'questions'
  id: string
  answers: Record<string, string>
}

const PHASE_STATUSES: readonly PhaseStatus[] = ['pending', 'active', 'blocked', 'done', 'failed']
const CALLOUT_KINDS: readonly CalloutKind[] = ['note', 'tip', 'risk', 'decision', 'warning']
const FIELD_TYPES: readonly FieldType[] = ['text', 'number', 'textarea', 'select', 'checkbox', 'stepper']

export function phaseStatus(value: string | undefined): PhaseStatus {
  const status = value?.trim().toLowerCase()
  if (status && (PHASE_STATUSES as readonly string[]).includes(status)) return status as PhaseStatus
  return 'pending'
}

export function calloutKind(value: string | undefined): CalloutKind {
  const kind = value?.trim().toLowerCase()
  if (kind && (CALLOUT_KINDS as readonly string[]).includes(kind)) return kind as CalloutKind
  return 'note'
}

export function fieldType(value: string | undefined): FieldType {
  const type = value?.trim().toLowerCase()
  if (type && (FIELD_TYPES as readonly string[]).includes(type)) return type as FieldType
  return 'text'
}
