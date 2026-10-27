import type { PhaseStatus, PlanBlock, PlanDocument, PlanEntry, WorkflowEdgeSpec, WorkflowNodeSpec } from './types'

/** Nested tags are included when the plan was parsed. Hand-built documents fall back to top-level blocks. */
export function planEntries(plan: PlanDocument): PlanEntry[] {
  if (plan.entries) return plan.entries
  return plan.blocks.map(blockToEntry)
}

function blockToEntry(block: PlanBlock): PlanEntry {
  switch (block.type) {
    case 'phase':
      return { type: 'phase', id: block.id, title: block.title, status: block.status, anchor: block.id }
    case 'choice':
      return { type: 'choice', id: block.id, prompt: block.prompt, anchor: block.id }
    case 'approve':
      return { type: 'approve', id: block.id, prompt: block.prompt, anchor: block.id }
    case 'form':
      return { type: 'form', id: block.id, prompt: block.prompt, anchor: block.id }
    case 'questions':
      return { type: 'questions', id: block.id, prompt: block.prompt, anchor: block.id }
    case 'checklist':
      return { type: 'checklist', id: block.id, title: block.title, anchor: block.id }
    case 'callout':
      return { type: 'callout', id: block.id, title: block.title, kind: block.kind, anchor: block.id }
    case 'workflow':
      return {
        type: 'workflow',
        id: block.id,
        title: block.title,
        nodes: block.nodes,
        edges: block.edges,
        anchor: block.id,
      }
    case 'markdown':
      return { type: 'markdown' }
  }
}

export function entryLabel(entry: PlanEntry): string | undefined {
  switch (entry.type) {
    case 'phase':
      return entry.title
    case 'choice':
    case 'approve':
    case 'form':
      return entry.prompt
    case 'questions':
      return entry.prompt ?? 'Questions'
    case 'checklist':
      return entry.title ?? 'Checklist'
    case 'callout':
      return entry.title ?? entry.kind
    case 'workflow':
      return entry.title ?? 'Workflow'
    case 'markdown':
      return undefined
  }
}

export function entryKindLabel(entry: PlanEntry): string | undefined {
  switch (entry.type) {
    case 'phase':
      return 'Phase'
    case 'choice':
      return 'Choice'
    case 'approve':
      return 'Approval'
    case 'form':
      return 'Form'
    case 'questions':
      return 'Questions'
    case 'checklist':
      return 'Checklist'
    case 'callout':
      return entry.kind
    default:
      return undefined
  }
}

export function entryInAutoWorkflow(entry: PlanEntry): boolean {
  switch (entry.type) {
    case 'phase':
    case 'choice':
    case 'approve':
    case 'form':
    case 'questions':
      return true
    case 'checklist':
    case 'callout':
      return Boolean(entry.id || entry.title)
    default:
      return false
  }
}

export function entryAnchor(entry: PlanEntry, index: number): string | undefined {
  if (entry.anchor) return entry.anchor
  if (
    entry.type === 'phase' ||
    entry.type === 'choice' ||
    entry.type === 'approve' ||
    entry.type === 'form' ||
    entry.type === 'questions' ||
    entry.type === 'workflow'
  ) {
    return entry.id
  }
  if (entry.type === 'checklist') return entry.id ?? (entry.title ? `checklist-${index}` : undefined)
  if (entry.type === 'callout') return entry.id ?? (entry.title ? `callout-${index}` : undefined)
  return undefined
}

export function entryPhaseStatus(entry: PlanEntry): PhaseStatus | undefined {
  if (entry.type !== 'phase' || !entry.status) return undefined
  return entry.status
}

export function entryWorkflow(entry: PlanEntry): { nodes: WorkflowNodeSpec[]; edges: WorkflowEdgeSpec[] } | undefined {
  if (entry.type !== 'workflow' || !entry.nodes) return undefined
  return { nodes: entry.nodes, edges: entry.edges ?? [] }
}
