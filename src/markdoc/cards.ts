import { Tag, type RenderableTreeNode } from '@markdoc/markdoc'
import { planRefHash } from '../planRefNavigation'
import type { InteractionResponse } from '../types'
import type {
  ChecklistItem,
  ChoiceOption,
  FormField,
  PhaseStatus,
  WorkflowNodeSpec,
} from '../types'
import { withNewlines } from './scope'

function section(
  className: string,
  attrs: Record<string, string>,
  children: RenderableTreeNode[],
): Tag {
  return new Tag('section', { class: className, 'data-section': '', ...attrs }, children)
}

function anchorAttrs(anchorId?: string): Record<string, string> {
  if (!anchorId) return {}
  return { id: `plan-${anchorId}`, 'data-plan-ref': anchorId, tabindex: '-1' }
}

function scopeAttrs(scope: string): Record<string, string> {
  return { 'data-plan-part': scope, 'data-plan-kind': 'section' }
}

function responseFor(
  responses: Record<string, InteractionResponse>,
  id: string,
): InteractionResponse | undefined {
  return responses[id]
}

function stateNode(id: string, children: RenderableTreeNode[]): Tag {
  return new Tag('div', { class: 'interaction-state', 'data-state-for': id }, children)
}

export function phaseCard(input: {
  id: string
  title: string
  status: PhaseStatus
  anchorId?: string
  scope: string
  body: RenderableTreeNode[]
}): Tag {
  return section(
    `block phase status-${input.status}`,
    { ...anchorAttrs(input.anchorId), ...scopeAttrs(input.scope) },
    [
      new Tag('div', { class: 'phase-rail', 'aria-hidden': 'true' }, []),
      '\n',
      new Tag('div', { class: 'phase-body' }, [
        new Tag('div', { class: 'phase-meta' }, [
          new Tag('span', { class: 'phase-status' }, [input.status]),
          new Tag('h3', { 'data-plan-part': `${input.scope}/title`, 'data-plan-kind': 'title' }, [input.title]),
        ]),
        '\n',
        new Tag('div', { class: 'rich' }, withNewlines(input.body)),
      ]),
    ],
  )
}

export function calloutCard(input: {
  kind: string
  title?: string
  anchorId?: string
  scope: string
  body: RenderableTreeNode[]
}): Tag {
  const label = input.title ? `${input.kind} · ${input.title}` : input.kind
  return section(
    `block callout kind-${input.kind}`,
    { ...anchorAttrs(input.anchorId), ...scopeAttrs(input.scope) },
    [
      new Tag(
        'div',
        { class: 'callout-label', 'data-plan-part': `${input.scope}/label`, 'data-plan-kind': 'label' },
        [label],
      ),
      '\n',
      new Tag('div', { class: 'rich' }, withNewlines(input.body)),
    ],
  )
}

export function choiceCard(input: {
  id: string
  prompt: string
  options: ChoiceOption[]
  anchorId?: string
  scope: string
  responses: Record<string, InteractionResponse>
  locked: boolean
}): Tag {
  const existing = responseFor(input.responses, input.id)
  const selected = existing?.kind === 'choice' ? existing.optionId : undefined
  const disabled = Boolean(existing) || input.locked
  const options = input.options.map((option) => {
    const isSelected = selected === option.id
    const attrs: Record<string, string> = {
      type: 'button',
      class: isSelected ? 'choice-option selected' : 'choice-option',
      'data-choice-id': input.id,
      'data-option-id': option.id,
      'data-option-label': option.label,
      'data-plan-part': `${input.scope}/option:${option.id}`,
      'data-plan-kind': 'choice',
    }
    if (disabled) attrs.disabled = ''
    return new Tag('button', attrs, [
      new Tag('span', { class: 'choice-label' }, [option.label]),
      ...(option.description ? [new Tag('span', { class: 'choice-desc' }, [option.description])] : []),
    ])
  })
  const state = input.locked
    ? ['Locked during execution']
    : selected
      ? ['Selected: ', new Tag('strong', {}, [selected])]
      : ['Waiting for a selection']
  return section(
    'block interaction choice',
    {
      'data-interaction-id': input.id,
      ...anchorAttrs(input.anchorId),
      ...scopeAttrs(input.scope),
    },
    [
      new Tag('div', { class: 'interaction-kicker' }, ['Needs your choice']),
      '\n',
      new Tag('h3', { 'data-plan-part': `${input.scope}/prompt`, 'data-plan-kind': 'prompt' }, [input.prompt]),
      '\n',
      new Tag('div', { class: 'choice-grid' }, options),
      '\n',
      stateNode(input.id, state),
    ],
  )
}

export function approveCard(input: {
  id: string
  prompt: string
  anchorId?: string
  scope: string
  body: RenderableTreeNode[]
  responses: Record<string, InteractionResponse>
  locked: boolean
}): Tag {
  const existing = responseFor(input.responses, input.id)
  const decided = existing?.kind === 'approve' ? existing : undefined
  const disabled = Boolean(decided) || input.locked
  const noteAttrs: Record<string, string> = {
    'data-approve-note': input.id,
    placeholder: 'Direction for the agent',
  }
  if (disabled) noteAttrs.disabled = ''
  const deny: Record<string, string> = {
    type: 'button',
    class: 'btn danger',
    'data-approve-id': input.id,
    'data-approved': 'false',
  }
  const allow: Record<string, string> = {
    type: 'button',
    class: 'btn primary',
    'data-approve-id': input.id,
    'data-approved': 'true',
  }
  if (disabled) {
    deny.disabled = ''
    allow.disabled = ''
  }
  const state = input.locked
    ? ['Locked during execution']
    : decided
      ? [decided.approved ? 'Approved' : 'Denied']
      : ['Waiting for approval']
  return section(
    'block interaction approve',
    {
      'data-interaction-id': input.id,
      ...anchorAttrs(input.anchorId),
      ...scopeAttrs(input.scope),
    },
    [
      new Tag('div', { class: 'interaction-kicker' }, ['Approval gate']),
      '\n',
      new Tag('h3', { 'data-plan-part': `${input.scope}/prompt`, 'data-plan-kind': 'prompt' }, [input.prompt]),
      '\n',
      new Tag('div', { class: 'rich' }, withNewlines(input.body)),
      '\n',
      new Tag('label', { class: 'field' }, [
        new Tag('span', {}, ['Optional note']),
        new Tag('textarea', noteAttrs, [decided?.note ?? '']),
      ]),
      '\n',
      new Tag('div', { class: 'button-row' }, [new Tag('button', deny, ['Deny']), new Tag('button', allow, ['Approve'])]),
      '\n',
      stateNode(input.id, state),
    ],
  )
}

function fieldControl(field: FormField, current: string | number, disabled: boolean, scope: string): Tag {
  const fieldAttrs = {
    'data-plan-part': `${scope}/field:${field.name}`,
    'data-plan-kind': 'field',
  }
  const label = `${field.label}${field.required ? ' *' : ''}`
  if (field.type === 'textarea') {
    const attrs: Record<string, string> = {
      name: field.name,
      placeholder: field.placeholder ?? '',
    }
    if (field.required) attrs.required = ''
    if (disabled) attrs.disabled = ''
    return new Tag('label', { class: 'field', ...fieldAttrs }, [
      new Tag('span', {}, [label]),
      new Tag('textarea', attrs, [String(current)]),
    ])
  }
  if (field.type === 'select') {
    const attrs: Record<string, string> = { name: field.name }
    if (field.required) attrs.required = ''
    if (disabled) attrs.disabled = ''
    const options = (field.options ?? []).map((option) => {
      const optionAttrs: Record<string, string> = { value: option }
      if (String(current) === option) optionAttrs.selected = ''
      return new Tag('option', optionAttrs, [option])
    })
    return new Tag('label', { class: 'field', ...fieldAttrs }, [
      new Tag('span', {}, [label]),
      new Tag('select', attrs, options),
    ])
  }
  const attrs: Record<string, string> = {
    type: field.type === 'number' ? 'number' : 'text',
    name: field.name,
    value: String(current),
    placeholder: field.placeholder ?? '',
  }
  if (field.required) attrs.required = ''
  if (disabled) attrs.disabled = ''
  return new Tag('label', { class: 'field', ...fieldAttrs }, [
    new Tag('span', {}, [label]),
    new Tag('input', attrs, []),
  ])
}

export function formCard(input: {
  id: string
  prompt: string
  fields: FormField[]
  anchorId?: string
  scope: string
  responses: Record<string, InteractionResponse>
  locked: boolean
}): Tag {
  const existing = responseFor(input.responses, input.id)
  const values = existing?.kind === 'form' ? existing.values : {}
  const disabled = Boolean(existing) || input.locked
  const fields = input.fields.map((field) => fieldControl(field, values[field.name] ?? field.default ?? '', disabled, input.scope))
  const submit: Record<string, string> = { type: 'submit', class: 'btn primary' }
  if (disabled) submit.disabled = ''
  return section(
    'block interaction form',
    {
      'data-interaction-id': input.id,
      ...anchorAttrs(input.anchorId),
      ...scopeAttrs(input.scope),
    },
    [
      new Tag('div', { class: 'interaction-kicker' }, ['Needs input']),
      '\n',
      new Tag('h3', { 'data-plan-part': `${input.scope}/prompt`, 'data-plan-kind': 'prompt' }, [input.prompt]),
      '\n',
      new Tag('form', { 'data-form-id': input.id }, [...fields, new Tag('button', submit, ['Submit'])]),
      '\n',
      stateNode(input.id, [input.locked ? 'Locked during execution' : existing ? 'Submitted' : 'Waiting for form values']),
    ],
  )
}

export function questionsCard(input: {
  id: string
  prompt?: string
  items: string[]
  anchorId?: string
  scope: string
  responses: Record<string, InteractionResponse>
  locked: boolean
}): Tag {
  const existing = responseFor(input.responses, input.id)
  const answers = existing?.kind === 'questions' ? existing.answers : {}
  const disabled = Boolean(existing) || input.locked
  const items = input.items.map((item, index) => {
    const key = String(index)
    const attrs: Record<string, string> = { name: key, placeholder: 'Your answer' }
    if (disabled) attrs.disabled = ''
    return new Tag(
      'label',
      {
        class: 'field',
        'data-plan-part': `${input.scope}/question:${index + 1}`,
        'data-plan-kind': 'question',
      },
      [new Tag('span', {}, [`${index + 1}. ${item}`]), new Tag('textarea', attrs, [String(answers[key] ?? '')])],
    )
  })
  const submit: Record<string, string> = { type: 'submit', class: 'btn primary' }
  if (disabled) submit.disabled = ''
  return section(
    'block interaction questions',
    {
      'data-interaction-id': input.id,
      ...anchorAttrs(input.anchorId),
      ...scopeAttrs(input.scope),
    },
    [
      new Tag('div', { class: 'interaction-kicker' }, ['Open questions']),
      '\n',
      new Tag('h3', { 'data-plan-part': `${input.scope}/prompt`, 'data-plan-kind': 'prompt' }, [
        input.prompt || 'Please answer',
      ]),
      '\n',
      new Tag('form', { 'data-questions-id': input.id }, [...items, new Tag('button', submit, ['Send answers'])]),
      '\n',
      stateNode(input.id, [input.locked ? 'Locked during execution' : existing ? 'Answers sent' : 'Waiting for answers']),
    ],
  )
}

export function checklistCard(input: {
  title?: string
  items: ChecklistItem[]
  anchorId?: string
  scope: string
}): Tag {
  const items = input.items.map((item, index) => {
    return new Tag(
      'li',
      {
        class: item.done ? 'done' : '',
        'data-plan-part': `${input.scope}/item:${index + 1}`,
        'data-plan-kind': 'checklist-item',
      },
      [new Tag('span', { class: 'check' }, [item.done ? 'done' : 'todo']), item.text],
    )
  })
  const children: RenderableTreeNode[] = []
  if (input.title) {
    children.push(
      new Tag('h3', { 'data-plan-part': `${input.scope}/title`, 'data-plan-kind': 'title' }, [input.title]),
      '\n',
    )
  }
  children.push(new Tag('ul', {}, items))
  return section(
    'block checklist',
    { ...anchorAttrs(input.anchorId), ...scopeAttrs(input.scope) },
    children,
  )
}

export function workflowCard(input: {
  id: string
  title?: string
  nodes: WorkflowNodeSpec[]
  anchorId?: string
  scope: string
}): Tag {
  const steps = input.nodes.map((node) => {
    const ref = node.ref ?? node.id
    const label = node.label ?? node.id
    return new Tag('li', {}, [
      new Tag(
        'a',
        {
          class: 'workflow-step',
          href: planRefHash(ref),
          'data-plan-jump': ref,
          'data-plan-part': `${input.scope}/step:${node.id}`,
          'data-plan-kind': 'workflow-step',
        },
        [
          new Tag('span', { class: 'workflow-step-label' }, [label]),
          new Tag('span', { class: 'workflow-step-ref' }, [`Plan · ${ref}`]),
        ],
      ),
    ])
  })
  return section(
    'block workflow',
    { ...anchorAttrs(input.anchorId), ...scopeAttrs(input.scope) },
    [
      new Tag('div', { class: 'interaction-kicker' }, ['Expected workflow']),
      '\n',
      new Tag('h3', { 'data-plan-part': `${input.scope}/title`, 'data-plan-kind': 'title' }, [
        input.title ?? 'Execution plan',
      ]),
      '\n',
      new Tag(
        'p',
        { class: 'workflow-note', 'data-plan-part': `${input.scope}/note`, 'data-plan-kind': 'paragraph' },
        [
          'These steps are the execution plan before the run is laid down. The Workflow tab draws the same path. Select a step there to jump to the matching place in this plan.',
        ],
      ),
      '\n',
      new Tag('ol', { class: 'workflow-steps' }, steps),
      '\n',
      new Tag('button', { type: 'button', class: 'btn', 'data-tab-jump': 'workflow' }, ['Open workflow diagram']),
    ],
  )
}

export function markdownSection(input: {
  scope: string
  body: RenderableTreeNode[]
}): Tag {
  return section('block markdown', scopeAttrs(input.scope), [new Tag('div', { class: 'rich' }, withNewlines(input.body))])
}

export function statusChip(status: string, label: string): Tag {
  return new Tag('span', { class: `status-chip status-${status}` }, [label])
}
