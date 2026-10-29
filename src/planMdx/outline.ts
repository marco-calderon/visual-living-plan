import { renderPlanMarkdown } from './markdown'
import { calloutKind, phaseStatus, slugify } from './payload'
import type {
  ChecklistItem,
  ChoiceOption,
  FormField,
  PlanBlock,
  PlanEntry,
  WorkflowEdgeSpec,
  WorkflowNodeSpec,
} from '../types'

const ENTRY_NAMES = new Set([
  'phase',
  'callout',
  'choice',
  'option',
  'form',
  'field',
  'questions',
  'item',
  'approve',
  'checklist',
  'workflow',
])

const LAYOUT_NAMES = new Set([
  'Box',
  'HStack',
  'VStack',
  'Stack',
  'Row',
  'ResponsiveStack',
  'box',
  'hstack',
  'vstack',
  'stack',
  'row',
])

const EMBED_NAMES = new Set([
  'Mermaid',
  'BarChart',
  'LineChart',
  'DataTable',
  'Column',
  'Row',
  'Cell',
  'Chip',
  'Pill',
  'Checkbox',
])

const KNOWN = new Set([...ENTRY_NAMES, ...LAYOUT_NAMES, ...EMBED_NAMES])

const INTERACTION = new Set(['choice', 'approve', 'form', 'questions'])

const LEGACY_MESSAGE =
  'Plan entries are MDX components such as <phase> and <choice>. {% tags %} and ```phase fences are not plan entries. A workflow graph is a structured body inside <workflow>.'

type Attrs = Record<string, string | number | boolean>

type ElementNode = {
  name: string
  kind: 'entry' | 'layout' | 'embed'
  attrs: Attrs
  children: Array<ElementNode | string>
  source: string
}

type Chunk = { kind: 'md'; text: string } | { kind: 'entry'; node: ElementNode }

/** {% tags %} and entry fences are not the authoring contract. A ```workflow fence may stay inside <workflow>. */
export function legacyPlanSyntaxError(source: string): string | undefined {
  if (/\{%\s*(?:phase|choice|approve|form|questions|checklist|callout|workflow|option|item|field|status)\b/.test(source)) {
    return LEGACY_MESSAGE
  }
  if (/^```(?:phase|choice|approve|form|questions|checklist|callout)\b/m.test(source)) return LEGACY_MESSAGE
  if (hasTopLevelWorkflowFence(source)) return LEGACY_MESSAGE
  return undefined
}

export function buildMdxOutline(body: string): {
  blocks: PlanBlock[]
  entries: PlanEntry[]
  interactionIds: string[]
} {
  const chunks = flatten(parseNodes(body))
  const blocks: PlanBlock[] = []
  const entries: PlanEntry[] = []
  for (const chunk of chunks) {
    const index = blocks.length
    if (chunk.kind === 'md') {
      const text = chunk.text.trim()
      blocks.push({
        type: 'markdown',
        html: markdownHtml(text, `markdown:${index}`),
        source: text,
      })
      continue
    }
    const built = blockFrom(chunk.node, index)
    blocks.push(built.block)
    entries.push(...built.entries)
  }
  return {
    blocks,
    entries,
    interactionIds: entries.flatMap((entry) => (entry.id && INTERACTION.has(entry.type) ? [entry.id] : [])),
  }
}

function hasTopLevelWorkflowFence(source: string): boolean {
  let depth = 0
  let index = 0
  while (index < source.length) {
    const rest = source.slice(index)
    const nextFence = /^```workflow\b/m.exec(rest)
    const nextOpen = /<workflow\b[^>]*>/.exec(rest)
    const nextClose = /<\/workflow\s*>/.exec(rest)
    const fenceAt = nextFence ? index + nextFence.index : Number.POSITIVE_INFINITY
    const openAt = nextOpen ? index + nextOpen.index : Number.POSITIVE_INFINITY
    const closeAt = nextClose ? index + nextClose.index : Number.POSITIVE_INFINITY
    const next = Math.min(fenceAt, openAt, closeAt)
    if (!Number.isFinite(next)) return false
    if (next === fenceAt) {
      if (depth === 0) return true
      index = fenceAt + (nextFence?.[0].length ?? 0)
      continue
    }
    if (next === openAt) {
      depth += 1
      index = openAt + (nextOpen?.[0].length ?? 0)
      continue
    }
    depth = Math.max(0, depth - 1)
    index = closeAt + (nextClose?.[0].length ?? 0)
  }
  return false
}

function parseNodes(source: string): Array<ElementNode | string> {
  const nodes: Array<ElementNode | string> = []
  let text = ''
  let index = 0
  const flush = () => {
    if (!text) return
    nodes.push(text)
    text = ''
  }
  while (index < source.length) {
    if (source.startsWith('```', index)) {
      const end = source.indexOf('```', index + 3)
      const close = end < 0 ? source.length : end + 3
      text += source.slice(index, close)
      index = close
      continue
    }
    if (source[index] === '<') {
      const tag = readTag(source, index)
      if (tag && KNOWN.has(tag.name)) {
        flush()
        if (tag.selfClosing) {
          nodes.push({
            name: tag.name,
            kind: kindOf(tag.name),
            attrs: tag.attrs,
            children: [],
            source: source.slice(index, tag.end),
          })
          index = tag.end
          continue
        }
        const close = findClose(source, tag.end, tag.name)
        if (!close) {
          text += source[index]
          index += 1
          continue
        }
        nodes.push({
          name: tag.name,
          kind: kindOf(tag.name),
          attrs: tag.attrs,
          children: parseNodes(source.slice(tag.end, close.start)),
          source: source.slice(index, close.end),
        })
        index = close.end
        continue
      }
    }
    text += source[index]
    index += 1
  }
  flush()
  return nodes
}

function flatten(nodes: Array<ElementNode | string>): Chunk[] {
  const chunks: Chunk[] = []
  let text = ''
  const flush = () => {
    if (text.trim()) chunks.push({ kind: 'md', text })
    text = ''
  }
  for (const node of nodes) {
    if (typeof node === 'string') {
      text += node
      continue
    }
    if (node.kind !== 'entry') {
      flush()
      chunks.push(...flatten(node.children))
      continue
    }
    flush()
    chunks.push({ kind: 'entry', node })
  }
  flush()
  return chunks
}

function blockFrom(node: ElementNode, index: number): { block: PlanBlock; entries: PlanEntry[] } {
  const entries: PlanEntry[] = []
  collectEntries(node, entries, index)
  return { block: toBlock(node, index), entries }
}

function collectEntries(node: ElementNode, entries: PlanEntry[], index: number): void {
  if (node.kind !== 'entry' || node.name === 'option' || node.name === 'field' || node.name === 'item') {
    for (const child of node.children) {
      if (typeof child !== 'string') collectEntries(child, entries, index)
    }
    return
  }
  entries.push(toEntry(node, index))
  for (const child of node.children) {
    if (typeof child !== 'string') collectEntries(child, entries, index)
  }
}

function toBlock(node: ElementNode, index: number): PlanBlock {
  const name = node.name
  if (name === 'phase') {
    const title = str(node.attrs.title) || 'Untitled phase'
    const id = str(node.attrs.id) || slugify(title) || 'phase'
    return {
      type: 'phase',
      id,
      title,
      status: phaseStatus(node.attrs.status),
      bodyHtml: markdownHtml(entryMarkdown(node.children), `phase:${id}`),
      source: node.source,
    }
  }
  if (name === 'callout') {
    const title = str(node.attrs.title) || undefined
    const id = str(node.attrs.id) || undefined
    return {
      type: 'callout',
      id,
      kind: calloutKind(node.attrs.kind),
      title,
      bodyHtml: markdownHtml(entryMarkdown(node.children), `callout:${id ?? index}`),
      source: node.source,
    }
  }
  if (name === 'choice') {
    const prompt = str(node.attrs.prompt) || 'Choose one'
    const id = str(node.attrs.id) || slugify(prompt) || 'choice'
    return { type: 'choice', id, prompt, options: optionsOf(node), source: node.source }
  }
  if (name === 'approve') {
    const prompt = str(node.attrs.prompt) || 'Approve this step?'
    const id = str(node.attrs.id) || slugify(prompt) || 'approve'
    return {
      type: 'approve',
      id,
      prompt,
      bodyHtml: markdownHtml(entryMarkdown(node.children), `approve:${id}`),
      source: node.source,
    }
  }
  if (name === 'form') {
    const prompt = str(node.attrs.prompt) || 'Provide details'
    const id = str(node.attrs.id) || slugify(prompt) || 'form'
    return { type: 'form', id, prompt, fields: fieldsOf(node), source: node.source }
  }
  if (name === 'questions') {
    const prompt = str(node.attrs.prompt) || undefined
    const id = str(node.attrs.id) || slugify(prompt ?? 'questions') || 'questions'
    return { type: 'questions', id, prompt, items: questionItems(node), source: node.source }
  }
  if (name === 'checklist') {
    const title = str(node.attrs.title) || undefined
    const id = str(node.attrs.id) || undefined
    return { type: 'checklist', id, title, items: checklistItems(node), source: node.source }
  }
  const title = str(node.attrs.title) || undefined
  const id = str(node.attrs.id) || slugify(title ?? 'workflow') || 'workflow'
  const graph = workflowOf(node)
  return { type: 'workflow', id, title, nodes: graph.nodes, edges: graph.edges, source: node.source }
}

function toEntry(node: ElementNode, index: number): PlanEntry {
  const block = toBlock(node, index)
  if (block.type === 'markdown') return { type: 'markdown' }
  if (block.type === 'phase') {
    return { type: 'phase', id: block.id, title: block.title, status: block.status, anchor: block.id }
  }
  if (block.type === 'callout') {
    return { type: 'callout', id: block.id, title: block.title, kind: block.kind, anchor: block.id }
  }
  if (block.type === 'choice') return { type: 'choice', id: block.id, prompt: block.prompt, anchor: block.id }
  if (block.type === 'approve') return { type: 'approve', id: block.id, prompt: block.prompt, anchor: block.id }
  if (block.type === 'form') return { type: 'form', id: block.id, prompt: block.prompt, anchor: block.id }
  if (block.type === 'questions') return { type: 'questions', id: block.id, prompt: block.prompt, anchor: block.id }
  if (block.type === 'checklist') {
    return { type: 'checklist', id: block.id, title: block.title, anchor: block.id }
  }
  return {
    type: 'workflow',
    id: block.id,
    title: block.title,
    nodes: block.nodes,
    edges: block.edges,
    anchor: block.id,
  }
}

function optionsOf(node: ElementNode): ChoiceOption[] {
  const options: ChoiceOption[] = []
  visit(node.children, (child) => {
    if (child.name !== 'option') return
    const id = str(child.attrs.id)
    const label = str(child.attrs.label)
    if (!id || !label) return
    const description = textOf(child.children).trim()
    options.push({ id, label, ...(description ? { description } : {}) })
  })
  return options
}

function fieldsOf(node: ElementNode): FormField[] {
  const fields: FormField[] = []
  visit(node.children, (child) => {
    if (child.name !== 'field') return
    const name = str(child.attrs.name)
    const label = str(child.attrs.label)
    if (!name || !label) return
    const type = fieldType(str(child.attrs.type))
    const required = child.attrs.required === true || child.attrs.required === 'true' || child.attrs.required === ''
    let fallback = child.attrs.default
    if ((type === 'number' || type === 'stepper') && (typeof fallback === 'string' || typeof fallback === 'number')) {
      const numeric = typeof fallback === 'number' ? fallback : Number(fallback)
      if (fallback !== '' && Number.isFinite(numeric)) fallback = numeric
    }
    const options =
      typeof child.attrs.options === 'string'
        ? child.attrs.options
            .split(',')
            .map((option) => option.trim())
            .filter(Boolean)
        : undefined
    const placeholder = str(child.attrs.placeholder)
    const min = numericAttr(child.attrs.min)
    const max = numericAttr(child.attrs.max)
    const step = numericAttr(child.attrs.step)
    fields.push({
      name,
      label,
      type,
      ...(required ? { required: true } : {}),
      ...(fallback !== undefined && fallback !== '' ? { default: fallback as string | number } : {}),
      ...(options && options.length > 0 ? { options } : {}),
      ...(placeholder ? { placeholder } : {}),
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      ...(step !== undefined ? { step } : {}),
    })
  })
  return fields
}

function questionItems(node: ElementNode): string[] {
  const items: string[] = []
  visit(node.children, (child) => {
    if (child.name !== 'item') return
    const text = textOf(child.children).trim()
    if (text) items.push(text)
  })
  return items
}

function checklistItems(node: ElementNode): ChecklistItem[] {
  const items: ChecklistItem[] = []
  visit(node.children, (child) => {
    if (child.name !== 'item') return
    const text = textOf(child.children).trim()
    if (!text) return
    items.push({ text, done: child.attrs.done === true || child.attrs.done === 'true' })
  })
  return items
}

function workflowOf(node: ElementNode): { nodes: WorkflowNodeSpec[]; edges: WorkflowEdgeSpec[] } {
  const [head, tail = ''] = textOf(node.children).trim().split(/\n\s*--\s*\n/)
  const nodes: WorkflowNodeSpec[] = []
  for (const line of (head ?? '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('```')) continue
    const [id, label, ref, detail] = trimmed.split('|').map((part) => part.trim())
    if (!id || !label) continue
    nodes.push({
      id,
      label,
      ...(ref ? { ref } : {}),
      ...(detail ? { detail } : {}),
    })
  }
  const edges: WorkflowEdgeSpec[] = []
  for (const line of tail.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('```')) continue
    const [path, label] = trimmed.split('|').map((part) => part.trim())
    const match = /^(\S+)\s*->\s*(\S+)(?:\s+@\s*(\w+)>(\w+))?$/.exec(path ?? '')
    if (!match) continue
    const from = match[1] ?? ''
    const to = match[2] ?? ''
    if (!from || !to) continue
    const fromSide = sideOf(match[3])
    const toSide = sideOf(match[4])
    edges.push({
      from,
      to,
      ...(label ? { label } : {}),
      ...(fromSide ? { fromSide } : {}),
      ...(toSide ? { toSide } : {}),
    })
  }
  return { nodes, edges }
}

function sideOf(value: string | undefined): string | undefined {
  if (value === 'top' || value === 'right' || value === 'bottom' || value === 'left') return value
  return undefined
}

function visit(nodes: Array<ElementNode | string>, fn: (node: ElementNode) => void): void {
  for (const node of nodes) {
    if (typeof node === 'string') continue
    fn(node)
    if (node.kind !== 'entry' || node.name === 'option' || node.name === 'field' || node.name === 'item') {
      visit(node.children, fn)
    }
  }
}

function entryMarkdown(nodes: Array<ElementNode | string>): string {
  let text = ''
  for (const node of nodes) {
    if (typeof node === 'string') text += node
    else if (node.kind !== 'entry') text += entryMarkdown(node.children)
  }
  return text.trim()
}

function textOf(nodes: Array<ElementNode | string>): string {
  return nodes.map((node) => (typeof node === 'string' ? node : textOf(node.children))).join('')
}

function markdownHtml(markdown: string, scope: string): string {
  const trimmed = markdown.trim()
  if (!trimmed) return ''
  return renderPlanMarkdown(trimmed, scope)
}

function kindOf(name: string): ElementNode['kind'] {
  if (ENTRY_NAMES.has(name)) return 'entry'
  if (LAYOUT_NAMES.has(name)) return 'layout'
  return 'embed'
}

function readTag(
  source: string,
  at: number,
): { name: string; attrs: Attrs; end: number; selfClosing: boolean } | null {
  const match = /^<([A-Za-z][\w]*)\b([^>]*)>/.exec(source.slice(at))
  if (!match) return null
  const name = match[1] ?? ''
  let raw = match[2] ?? ''
  const selfClosing = /\/\s*$/.test(raw)
  if (selfClosing) raw = raw.replace(/\/\s*$/, '')
  return { name, attrs: parseAttrs(raw), end: at + match[0].length, selfClosing }
}

function findClose(source: string, from: number, name: string): { start: number; end: number } | null {
  let depth = 1
  let index = from
  const openRe = new RegExp(`<${name}\\b[^>]*>`, 'g')
  const closeRe = new RegExp(`</${name}\\s*>`, 'g')
  while (index < source.length) {
    const fence = source.indexOf('```', index)
    openRe.lastIndex = index
    closeRe.lastIndex = index
    const nextOpen = openRe.exec(source)
    const nextClose = closeRe.exec(source)
    if (!nextClose) return null
    const openAt = nextOpen?.index ?? Infinity
    const closeAt = nextClose.index
    if (fence >= index && fence < openAt && fence < closeAt) {
      const end = source.indexOf('```', fence + 3)
      index = end < 0 ? source.length : end + 3
      continue
    }
    if (nextOpen && openAt < closeAt) {
      if (!nextOpen[0].endsWith('/>')) depth += 1
      index = openAt + nextOpen[0].length
      continue
    }
    depth -= 1
    if (depth === 0) return { start: closeAt, end: closeAt + nextClose[0].length }
    index = closeAt + nextClose[0].length
  }
  return null
}

function parseAttrs(raw: string): Attrs {
  const attrs: Attrs = {}
  for (const match of raw.matchAll(/([A-Za-z_][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}|([^\s"'=/>]+)))?/g)) {
    const key = match[1]
    if (!key) continue
    if (match[2] !== undefined) attrs[key] = match[2]
    else if (match[3] !== undefined) attrs[key] = match[3]
    else if (match[4] !== undefined) attrs[key] = parseExpr(match[4].trim())
    else if (match[5] !== undefined) attrs[key] = match[5]
    else attrs[key] = true
  }
  return attrs
}

function parseExpr(value: string): string | number | boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value)
  const quoted = /^["']([\s\S]*)["']$/.exec(value)
  if (quoted) return quoted[1] ?? ''
  return value
}

function fieldType(value: string): FormField['type'] {
  if (
    value === 'number' ||
    value === 'textarea' ||
    value === 'select' ||
    value === 'checkbox' ||
    value === 'stepper' ||
    value === 'text'
  ) {
    return value
  }
  return 'text'
}

function numericAttr(value: string | number | boolean | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return undefined
}

function str(value: string | number | boolean | undefined): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}
