export type PhaseStatus = 'pending' | 'active' | 'blocked' | 'done' | 'failed'

export type InteractionKind = 'choice' | 'approve' | 'form' | 'questions'

export type PlanBlock =
  | { type: 'markdown'; html: string; source: string }
  | { type: 'phase'; id: string; title: string; status: PhaseStatus; bodyHtml: string; source: string }
  | { type: 'callout'; kind: 'note' | 'tip' | 'risk' | 'decision' | 'warning'; title?: string; bodyHtml: string; source: string }
  | { type: 'choice'; id: string; prompt: string; options: ChoiceOption[]; source: string }
  | { type: 'approve'; id: string; prompt: string; bodyHtml: string; source: string }
  | { type: 'form'; id: string; prompt: string; fields: FormField[]; source: string }
  | { type: 'questions'; id: string; prompt?: string; items: string[]; source: string }
  | { type: 'checklist'; title?: string; items: ChecklistItem[]; source: string }

export type ChoiceOption = {
  id: string
  label: string
  description?: string
}

export type FormField = {
  name: string
  label: string
  type: 'text' | 'number' | 'textarea' | 'select'
  required?: boolean
  default?: string | number
  options?: string[]
  placeholder?: string
}

export type ChecklistItem = {
  text: string
  done: boolean
}

export type PlanDocument = {
  title: string
  summary?: string
  agent?: string
  mode?: 'watch' | 'review'
  sourcePath?: string
  source: string
  blocks: PlanBlock[]
  interactionIds: string[]
}

export type InteractionResponse =
  | { kind: 'choice'; id: string; optionId: string; label: string }
  | { kind: 'approve'; id: string; approved: boolean; note?: string }
  | { kind: 'form'; id: string; values: Record<string, string | number> }
  | { kind: 'questions'; id: string; answers: Record<string, string> }

export type ReviewDecision = 'approve' | 'deny' | 'iterate'

export type ReviewResult = {
  decision: ReviewDecision
  comments: Array<{ sectionId?: string; text: string }>
  note?: string
  responses: InteractionResponse[]
  iteration: number
}

export type SectionDiff = {
  index: number
  status: 'added' | 'edited' | 'removed' | 'unchanged'
}
