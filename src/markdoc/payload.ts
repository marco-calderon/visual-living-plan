import type { Node } from '@markdoc/markdoc'
import { parseMarkup } from './parseMarkup'
import { parse as parseYaml } from 'yaml'
import { ENTRY_TAGS } from './sections'
import type {
  ChecklistItem,
  ChoiceOption,
  FormField,
  PhaseStatus,
  WorkflowEdgeSpec,
  WorkflowNodeSpec,
} from '../types'

const PHASE_STATUSES: PhaseStatus[] = ['pending', 'active', 'blocked', 'done', 'failed']

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function phaseStatus(value: unknown): PhaseStatus {
  const status = String(value ?? 'pending')
  return PHASE_STATUSES.includes(status as PhaseStatus) ? (status as PhaseStatus) : 'pending'
}

export function calloutKind(value: unknown): 'note' | 'tip' | 'risk' | 'decision' | 'warning' {
  const kind = String(value ?? 'note')
  if (kind === 'tip' || kind === 'risk' || kind === 'decision' || kind === 'warning') return kind
  return 'note'
}

export function isYamlFence(node: Node): boolean {
  if (node.type !== 'fence') return false
  const language = String(node.attributes.language ?? '').toLowerCase()
  return language === 'yaml' || language === 'yml'
}

export function contentNodes(node: Node): Node[] {
  return node.children.filter((child) => !isYamlFence(child))
}

/** Tag attributes override keys in a child YAML fence. The fence is how the shim keeps old blocks. */
export function mergeEntry(node: Node): Record<string, unknown> {
  const fence = node.children.find(isYamlFence)
  const data = fence ? asRecord(parseYaml(String(fence.attributes.content ?? ''))) : {}
  for (const [key, value] of Object.entries(node.attributes)) {
    if (value !== undefined) data[key] = value
  }
  return data
}

export function entryBody(node: Node, data: Record<string, unknown>, source: string): { nodes: Node[]; fenceSource: string } {
  const content = contentNodes(node)
  if (content.length > 0) return { nodes: content, fenceSource: source }
  const body = data.body ?? data.description
  if (typeof body !== 'string' || !body.trim()) return { nodes: [], fenceSource: source }
  const text = String(body)
  return { nodes: parseMarkup(text).children, fenceSource: text }
}

export function plainText(node: Node): string {
  if (node.type === 'text' || node.type === 'code') return String(node.attributes.content ?? '')
  if (node.type === 'softbreak' || node.type === 'hardbreak') return ' '
  if (node.type === 'tag' && node.tag && (node.tag === 'option' || node.tag === 'item' || ENTRY_TAGS.has(node.tag))) {
    return ''
  }
  return node.children.map((child) => plainText(child)).join('')
}

export function collapsedText(nodes: Node[]): string {
  return nodes
    .map((node) => plainText(node))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function findChildTags(nodes: Node[], name: string): Node[] {
  const found: Node[] = []
  const walk = (node: Node) => {
    if (node.type === 'tag' && node.tag === name) {
      found.push(node)
      return
    }
    if (node.type === 'tag' && node.tag && ENTRY_TAGS.has(node.tag)) return
    for (const child of node.children) walk(child)
  }
  for (const node of nodes) walk(node)
  return found
}

export function choiceOptions(data: Record<string, unknown>, nodes: Node[]): ChoiceOption[] {
  const tags = findChildTags(nodes, 'option')
  if (tags.length > 0) {
    return tags.map((tag, index) => {
      const label = String(tag.attributes.label ?? `Option ${index + 1}`)
      const description = collapsedText(tag.children)
      return {
        id: String(tag.attributes.id ?? (slugify(label) || `option-${index + 1}`)),
        label,
        description: description || undefined,
      }
    })
  }
  const optionsRaw = Array.isArray(data.options) ? data.options : []
  return optionsRaw.map((item, index) => {
    const option = asRecord(item)
    const label = String(option.label ?? `Option ${index + 1}`)
    return {
      id: String(option.id ?? (slugify(label) || `option-${index + 1}`)),
      label,
      description: option.description ? String(option.description) : undefined,
    }
  })
}

export function formFields(data: Record<string, unknown>): FormField[] {
  const fieldsRaw = Array.isArray(data.fields) ? data.fields : []
  return fieldsRaw.map((item, index) => {
    const field = asRecord(item)
    const name = String(field.name ?? `field_${index + 1}`)
    const typeRaw = String(field.type ?? 'text')
    const type = typeRaw === 'number' || typeRaw === 'textarea' || typeRaw === 'select' ? typeRaw : 'text'
    return {
      name,
      label: String(field.label ?? name),
      type,
      required: Boolean(field.required),
      default: typeof field.default === 'number' || typeof field.default === 'string' ? field.default : undefined,
      options: Array.isArray(field.options) ? field.options.map((option) => String(option)) : undefined,
      placeholder: field.placeholder ? String(field.placeholder) : undefined,
    }
  })
}

export function questionItems(data: Record<string, unknown>, nodes: Node[]): string[] {
  const tags = findChildTags(nodes, 'item')
  if (tags.length > 0) return tags.map((tag) => collapsedText(tag.children))
  const itemsRaw = Array.isArray(data.items) ? data.items : []
  return itemsRaw.map((item) => String(item))
}

export function checklistItems(data: Record<string, unknown>, nodes: Node[]): ChecklistItem[] {
  const tags = findChildTags(nodes, 'item')
  if (tags.length > 0) {
    return tags.map((tag) => ({
      text: collapsedText(tag.children),
      done: Boolean(tag.attributes.done),
    }))
  }
  const itemsRaw = Array.isArray(data.items) ? data.items : []
  return itemsRaw.map((item) => {
    if (typeof item === 'string') return { text: item, done: false }
    const row = asRecord(item)
    return { text: String(row.text ?? row.label ?? ''), done: Boolean(row.done) }
  })
}

export function workflowNodes(data: Record<string, unknown>): WorkflowNodeSpec[] {
  const nodesRaw = Array.isArray(data.nodes) ? data.nodes : []
  return nodesRaw.flatMap((item) => {
    const node = asRecord(item)
    const nodeId = String(node.id ?? '').trim()
    if (!nodeId) return []
    return [
      {
        id: nodeId,
        label: node.label ? String(node.label) : undefined,
        detail: node.detail ? String(node.detail) : undefined,
        ref: node.ref ? String(node.ref) : undefined,
        status: node.status ? String(node.status) : undefined,
        x: typeof node.x === 'number' ? node.x : undefined,
        y: typeof node.y === 'number' ? node.y : undefined,
      },
    ]
  })
}

export function workflowEdges(data: Record<string, unknown>): WorkflowEdgeSpec[] {
  const edgesRaw = Array.isArray(data.edges) ? data.edges : []
  return edgesRaw.flatMap((item) => {
    const edge = asRecord(item)
    const from = String(edge.from ?? '').trim()
    const to = String(edge.to ?? '').trim()
    if (!from || !to) return []
    return [
      {
        from,
        to,
        label: edge.label ? String(edge.label) : undefined,
        fromSide: edge.fromSide ? String(edge.fromSide) : undefined,
        toSide: edge.toSide ? String(edge.toSide) : undefined,
      },
    ]
  })
}

export function anchorFor(
  type: string,
  data: { id?: string; title?: string },
  index: number,
): string | undefined {
  if (
    type === 'phase' ||
    type === 'choice' ||
    type === 'approve' ||
    type === 'form' ||
    type === 'questions' ||
    type === 'workflow'
  ) {
    return data.id || undefined
  }
  if (type === 'checklist') return data.id || (data.title ? `checklist-${slugify(data.title)}-${index}` : undefined)
  if (type === 'callout') return data.id || (data.title ? `callout-${slugify(data.title)}-${index}` : undefined)
  return undefined
}

export function fenceInfo(node: Node, source: string): string {
  const lineNo = node.lines[0]
  if (typeof lineNo === 'number') {
    const line = source.split('\n')[lineNo] ?? ''
    const match = /^[ \t]*(?:`{3,}|~{3,})(.*)$/.exec(line)
    if (match) return match[1]?.trim() ?? ''
  }
  return String(node.attributes.language ?? '')
}

export function fenceParts(info: string): { language: string; diff: boolean; start: number } {
  let language = ''
  let diff = false
  let start = 0
  for (const raw of info.split(/\s+/)) {
    if (!raw) continue
    const token = raw.toLowerCase()
    if (token === 'diff' || token === 'patch') {
      diff = true
      continue
    }
    const startMatch = /^start=(\d+)$/i.exec(raw)
    if (startMatch) {
      const value = Number(startMatch[1])
      if (value >= 1) start = value
      continue
    }
    if (!language) language = token
  }
  return { language, diff, start }
}
