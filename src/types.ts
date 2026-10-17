export type PhaseStatus = 'pending' | 'active' | 'blocked' | 'done' | 'failed'

export type InteractionKind = 'choice' | 'approve' | 'form' | 'questions'

export type WorkflowNodeSpec = {
  id: string
  label?: string
  detail?: string
  /** Plan block id this step corresponds to. Defaults to `id` when that block exists. */
  ref?: string
  status?: string
  x?: number
  y?: number
}

export type WorkflowEdgeSpec = {
  from: string
  to: string
  label?: string
  fromSide?: string
  toSide?: string
}

export type PlanBlock =
  | { type: 'markdown'; html: string; source: string }
  | { type: 'phase'; id: string; title: string; status: PhaseStatus; bodyHtml: string; source: string }
  | {
      type: 'callout'
      id?: string
      kind: 'note' | 'tip' | 'risk' | 'decision' | 'warning'
      title?: string
      bodyHtml: string
      source: string
    }
  | { type: 'choice'; id: string; prompt: string; options: ChoiceOption[]; source: string }
  | { type: 'approve'; id: string; prompt: string; bodyHtml: string; source: string }
  | { type: 'form'; id: string; prompt: string; fields: FormField[]; source: string }
  | { type: 'questions'; id: string; prompt?: string; items: string[]; source: string }
  | { type: 'checklist'; id?: string; title?: string; items: ChecklistItem[]; source: string }
  | {
      type: 'workflow'
      id: string
      title?: string
      nodes: WorkflowNodeSpec[]
      edges: WorkflowEdgeSpec[]
      source: string
    }

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

export type CommentOutcome = 'implemented' | 'errored' | 'issues'

export type ReviewResult = {
  decision: ReviewDecision
  comments: Array<{ id?: string; sectionId?: string; text: string }>
  note?: string
  responses: InteractionResponse[]
  iteration: number
}

/** A message pinned to one rendered part of the plan. `addressingAt` is set while it is being worked on. `addressedAt` stays empty until it is resolved. */
export type PlanComment = {
  id: string
  partId: string
  kind: string
  blockId?: string
  excerpt: string
  text: string
  createdAt: number
  addressingAt?: number | null
  addressedAt: number | null
  outcome?: CommentOutcome | null
}

export type SectionDiff = {
  index: number
  status: 'added' | 'edited' | 'removed' | 'unchanged'
}

/**
 * One user submission stored for the agent CLI.
 * `deliveredAt` stays empty until that CLI has printed the event and acked it.
 */
export type PlanSubmissionEvent = {
  id: string
  seq: number
  event: 'interaction' | 'review' | 'comment'
  data: unknown
  createdAt: number
  deliveredAt: number | null
}
