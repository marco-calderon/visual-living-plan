import { parse as parseYaml } from 'yaml'
import { recordLog } from './serviceLog'
import type {
  ChecklistItem,
  ChoiceOption,
  FormField,
  PhaseStatus,
  PlanBlock,
  PlanDocument,
  WorkflowEdgeSpec,
  WorkflowNodeSpec,
} from './types'

const FENCE_RE =
  /^```(phase|choice|approve|form|questions|checklist|callout|workflow)\s*\n([\s\S]*?)^```/gm

const PHASE_STATUSES: PhaseStatus[] = ['pending', 'active', 'blocked', 'done', 'failed']

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function inlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}

function partAttr(scope: string, kind: string, index: number): string {
  return ` data-plan-part="${escapeHtml(`${scope}/${kind}:${index}`)}" data-plan-kind="${kind}"`
}

type ColumnAlign = 'left' | 'center' | 'right'

/** A GitHub-style pipe table: header, `| --- |` separator, then body rows. */
function isTableStart(lines: string[], index: number): boolean {
  const header = lines[index] ?? ''
  const delimiter = lines[index + 1]
  if (delimiter === undefined || !header.trim() || !rowHasSeparator(header)) return false
  const headerCells = splitTableRow(header)
  const delimiterCells = splitTableRow(delimiter)
  if (headerCells.length === 0 || headerCells.length !== delimiterCells.length) return false
  return columnAlignments(delimiterCells) !== null
}

function readTable(lines: string[], index: number): { html: string; next: number } {
  const header = splitTableRow(lines[index] ?? '')
  const alignments = columnAlignments(splitTableRow(lines[index + 1] ?? '')) ?? []
  const rows: string[][] = []
  let next = index + 2
  while (next < lines.length) {
    const line = lines[next] ?? ''
    if (!line.trim() || isBlockStart(line)) break
    const cells = splitTableRow(line)
    rows.push(header.map((_, column) => cells[column] ?? ''))
    next += 1
  }
  return { html: tableHtml(header, alignments, rows), next }
}

function tableHtml(header: string[], alignments: ColumnAlign[], rows: string[][]): string {
  const head = header
    .map((cell, column) => `<th${alignClass(alignments[column])}>${inlineMarkdown(cell)}</th>`)
    .join('')
  const body = rows
    .map((row) => {
      const cells = row
        .map((cell, column) => `<td${alignClass(alignments[column])}>${inlineMarkdown(cell)}</td>`)
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')
  const tbody = body ? `<tbody>${body}</tbody>` : ''
  return `<div class="rich-table"><table><thead><tr>${head}</tr></thead>${tbody}</table></div>`
}

function alignClass(align: ColumnAlign | undefined): string {
  if (align === 'center') return ' class="align-center"'
  if (align === 'right') return ' class="align-right"'
  return ''
}

function columnAlignments(cells: string[]): ColumnAlign[] | null {
  if (cells.length === 0) return null
  const alignments: ColumnAlign[] = []
  for (const cell of cells) {
    const compact = cell.replace(/\s/g, '')
    if (!/^:?-+:?$/.test(compact)) return null
    const left = compact.startsWith(':')
    const right = compact.endsWith(':')
    alignments.push(left && right ? 'center' : right ? 'right' : 'left')
  }
  return alignments
}

/** Split a row on separator pipes. `\|` is a literal pipe, including inside inline code. */
function splitTableRow(line: string): string[] {
  const text = line.trim()
  const cells: string[] = []
  let current = ''
  let codeSpan = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? ''
    if (ch === '\\' && text[i + 1] === '|') {
      current += '|'
      i += 1
      continue
    }
    if (ch === '`') {
      let run = 1
      while (text[i + run] === '`') run += 1
      if (codeSpan === 0) codeSpan = run
      else if (run === codeSpan) codeSpan = 0
      current += '`'.repeat(run)
      i += run - 1
      continue
    }
    if (ch === '|' && codeSpan === 0) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current.trim())
  if (text.startsWith('|')) cells.shift()
  if (text.endsWith('|') && cells[cells.length - 1] === '') cells.pop()
  return cells.length > 0 ? cells : ['']
}

function rowHasSeparator(line: string): boolean {
  const text = line.trim()
  let codeSpan = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? ''
    if (ch === '\\' && text[i + 1] === '|') {
      i += 1
      continue
    }
    if (ch === '`') {
      let run = 1
      while (text[i + run] === '`') run += 1
      if (codeSpan === 0) codeSpan = run
      else if (run === codeSpan) codeSpan = 0
      i += run - 1
      continue
    }
    if (ch === '|' && codeSpan === 0) return true
  }
  return false
}

function markdownToHtml(source: string, scope: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const parts: string[] = []
  let i = 0
  let headings = 0
  let paragraphs = 0
  let listItems = 0
  let diagrams = 0
  let codeBlocks = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (!line.trim()) {
      i += 1
      continue
    }

    if (line.startsWith('### ')) {
      headings += 1
      parts.push(`<h3${partAttr(scope, 'heading', headings)}>${inlineMarkdown(line.slice(4))}</h3>`)
      i += 1
      continue
    }

    if (line.startsWith('## ')) {
      headings += 1
      parts.push(`<h2${partAttr(scope, 'heading', headings)}>${inlineMarkdown(line.slice(3))}</h2>`)
      i += 1
      continue
    }

    if (line.startsWith('# ')) {
      headings += 1
      parts.push(`<h1${partAttr(scope, 'heading', headings)}>${inlineMarkdown(line.slice(2))}</h1>`)
      i += 1
      continue
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = []
      while (i < lines.length && /^[-*] /.test(lines[i] ?? '')) {
        listItems += 1
        items.push(
          `<li${partAttr(scope, 'list-item', listItems)}>${inlineMarkdown((lines[i] ?? '').replace(/^[-*] /, ''))}</li>`,
        )
        i += 1
      }
      parts.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i] ?? '')) {
        listItems += 1
        items.push(
          `<li${partAttr(scope, 'list-item', listItems)}>${inlineMarkdown((lines[i] ?? '').replace(/^\d+\.\s+/, ''))}</li>`,
        )
        i += 1
      }
      parts.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const code: string[] = []
      i += 1
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) {
        code.push(lines[i] ?? '')
        i += 1
      }
      i += 1
      const fence = fenceParts(lang)
      const diagram = code.join('\n')
      if (fence.language === 'mermaid' && !fence.diff && diagram.trim()) {
        diagrams += 1
        parts.push(
          `<figure class="mermaid-diagram"${partAttr(scope, 'diagram', diagrams)}><pre class="mermaid">${escapeHtml(diagram)}</pre></figure>`,
        )
      } else {
        codeBlocks += 1
        parts.push(
          `<pre class="code-block"${partAttr(scope, 'code', codeBlocks)}${codeFenceAttrs(lang)}><code>${escapeHtml(diagram)}</code></pre>`,
        )
      }
      continue
    }

    if (isTableStart(lines, i)) {
      const table = readTable(lines, i)
      parts.push(table.html)
      i = table.next
      continue
    }

    const para: string[] = []
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() &&
      !isBlockStart(lines[i] ?? '') &&
      !isTableStart(lines, i)
    ) {
      para.push(lines[i] ?? '')
      i += 1
    }
    paragraphs += 1
    parts.push(`<p${partAttr(scope, 'paragraph', paragraphs)}>${inlineMarkdown(para.join(' '))}</p>`)
  }

  return parts.join('\n')
}

function fenceParts(info: string): { language: string; diff: boolean; start: number } {
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

function codeFenceAttrs(info: string): string {
  const { language, diff, start } = fenceParts(info)
  const langAttr = language ? ` data-lang="${escapeHtml(language)}"` : ''
  const startAttr = !diff && start >= 1 ? ` data-start="${start}"` : ''
  const diffAttr = diff ? ` data-diff="true"` : ''
  return `${langAttr}${startAttr}${diffAttr}`
}

function isBlockStart(line: string): boolean {
  return (
    line.startsWith('#') ||
    line.startsWith('- ') ||
    line.startsWith('* ') ||
    /^\d+\.\s+/.test(line) ||
    line.startsWith('```')
  )
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function parsePhase(body: string, source: string): PlanBlock {
  const data = asRecord(parseYaml(body))
  const title = String(data.title ?? 'Untitled phase')
  const id = String(data.id ?? slugify(title))
  const statusRaw = String(data.status ?? 'pending')
  const status = (PHASE_STATUSES.includes(statusRaw as PhaseStatus)
    ? statusRaw
    : 'pending') as PhaseStatus
  const content = String(data.body ?? data.description ?? '')
  return {
    type: 'phase',
    id,
    title,
    status,
    bodyHtml: markdownToHtml(content, `phase:${id}`),
    source,
  }
}

function parseChoice(body: string, source: string): PlanBlock {
  const data = asRecord(parseYaml(body))
  const prompt = String(data.prompt ?? 'Choose one')
  const id = String(data.id ?? slugify(prompt))
  const optionsRaw = Array.isArray(data.options) ? data.options : []
  const options: ChoiceOption[] = optionsRaw.map((item, index) => {
    const option = asRecord(item)
    const label = String(option.label ?? `Option ${index + 1}`)
    return {
      id: String(option.id ?? (slugify(label) || `option-${index + 1}`)),
      label,
      description: option.description ? String(option.description) : undefined,
    }
  })
  return { type: 'choice', id, prompt, options, source }
}

function parseApprove(body: string, source: string): PlanBlock {
  const data = asRecord(parseYaml(body))
  const prompt = String(data.prompt ?? 'Approve this step?')
  const id = String(data.id ?? slugify(prompt))
  const content = String(data.body ?? data.description ?? '')
  return {
    type: 'approve',
    id,
    prompt,
    bodyHtml: markdownToHtml(content, `approve:${id}`),
    source,
  }
}

function parseForm(body: string, source: string): PlanBlock {
  const data = asRecord(parseYaml(body))
  const prompt = String(data.prompt ?? 'Provide details')
  const id = String(data.id ?? slugify(prompt))
  const fieldsRaw = Array.isArray(data.fields) ? data.fields : []
  const fields: FormField[] = fieldsRaw.map((item, index) => {
    const field = asRecord(item)
    const name = String(field.name ?? `field_${index + 1}`)
    const typeRaw = String(field.type ?? 'text')
    const type =
      typeRaw === 'number' || typeRaw === 'textarea' || typeRaw === 'select'
        ? typeRaw
        : 'text'
    return {
      name,
      label: String(field.label ?? name),
      type,
      required: Boolean(field.required),
      default:
        typeof field.default === 'number' || typeof field.default === 'string'
          ? field.default
          : undefined,
      options: Array.isArray(field.options)
        ? field.options.map((option) => String(option))
        : undefined,
      placeholder: field.placeholder ? String(field.placeholder) : undefined,
    }
  })
  return { type: 'form', id, prompt, fields, source }
}

function parseQuestions(body: string, source: string): PlanBlock {
  const data = asRecord(parseYaml(body))
  const prompt = data.prompt ? String(data.prompt) : undefined
  const id = String(data.id ?? slugify(prompt ?? 'questions'))
  const itemsRaw = Array.isArray(data.items) ? data.items : []
  const items = itemsRaw.map((item) => String(item))
  return { type: 'questions', id, prompt, items, source }
}

function parseChecklist(body: string, source: string): PlanBlock {
  const data = asRecord(parseYaml(body))
  const title = data.title ? String(data.title) : undefined
  const id = data.id ? String(data.id) : undefined
  const itemsRaw = Array.isArray(data.items) ? data.items : []
  const items: ChecklistItem[] = itemsRaw.map((item) => {
    if (typeof item === 'string') {
      return { text: item, done: false }
    }
    const row = asRecord(item)
    return {
      text: String(row.text ?? row.label ?? ''),
      done: Boolean(row.done),
    }
  })
  return { type: 'checklist', id, title, items, source }
}

function parseCallout(body: string, source: string, index: number): PlanBlock {
  const data = asRecord(parseYaml(body))
  const kindRaw = String(data.kind ?? 'note')
  const kind =
    kindRaw === 'tip' ||
    kindRaw === 'risk' ||
    kindRaw === 'decision' ||
    kindRaw === 'warning'
      ? kindRaw
      : 'note'
  const title = data.title ? String(data.title) : undefined
  const id = data.id ? String(data.id) : undefined
  const content = String(data.body ?? data.description ?? '')
  return {
    type: 'callout',
    id,
    kind,
    title,
    bodyHtml: markdownToHtml(content, `callout:${id ?? index}`),
    source,
  }
}

function parseWorkflow(body: string, source: string): PlanBlock {
  const data = asRecord(parseYaml(body))
  const title = data.title ? String(data.title) : undefined
  const id = String(data.id ?? '').trim() || slugify(title ?? 'workflow') || 'workflow'
  const nodesRaw = Array.isArray(data.nodes) ? data.nodes : []
  const nodes: WorkflowNodeSpec[] = nodesRaw.flatMap((item) => {
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
  const edgesRaw = Array.isArray(data.edges) ? data.edges : []
  const edges: WorkflowEdgeSpec[] = edgesRaw.flatMap((item) => {
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
  return { type: 'workflow', id, title, nodes, edges, source }
}

function parseFence(kind: string, body: string, source: string, index: number): PlanBlock {
  switch (kind) {
    case 'phase':
      return parsePhase(body, source)
    case 'choice':
      return parseChoice(body, source)
    case 'approve':
      return parseApprove(body, source)
    case 'form':
      return parseForm(body, source)
    case 'questions':
      return parseQuestions(body, source)
    case 'checklist':
      return parseChecklist(body, source)
    case 'callout':
      return parseCallout(body, source, index)
    case 'workflow':
      return parseWorkflow(body, source)
    default:
      return { type: 'markdown', html: markdownToHtml(source, `markdown:${index}`), source }
  }
}

function stripFrontmatter(source: string): { meta: Record<string, unknown>; body: string } {
  if (!source.startsWith('---\n')) {
    return { meta: {}, body: source }
  }
  const end = source.indexOf('\n---\n', 4)
  if (end === -1) {
    return { meta: {}, body: source }
  }
  const raw = source.slice(4, end)
  const body = source.slice(end + 5)
  return { meta: asRecord(parseYaml(raw)), body }
}

function rememberParseFailure(error: unknown, where: string, sourcePath?: string, planId?: string): void {
  const reason = error instanceof Error && error.message ? error.message : 'Could not parse the plan'
  const detail = [where, sourcePath ? `file: ${sourcePath}` : undefined, error instanceof Error ? error.stack : undefined]
    .filter((part): part is string => Boolean(part))
    .join('\n')
  void recordLog({
    level: 'error',
    message: `Failed to parse the plan: ${reason}`,
    detail,
    source: 'parse',
    planId,
    echo: false,
  }).catch(() => undefined)
}

export function parsePlan(source: string, sourcePath?: string, planId?: string): PlanDocument {
  let meta: Record<string, unknown>
  let body: string
  try {
    const stripped = stripFrontmatter(source.replace(/^\uFEFF/, ''))
    meta = stripped.meta
    body = stripped.body
  } catch (error) {
    rememberParseFailure(error, 'frontmatter', sourcePath, planId)
    throw error
  }
  const blocks: PlanBlock[] = []
  let cursor = 0
  FENCE_RE.lastIndex = 0

  for (const match of body.matchAll(FENCE_RE)) {
    const index = match.index ?? 0
    if (index > cursor) {
      const chunk = body.slice(cursor, index)
      if (chunk.trim()) {
        blocks.push({
          type: 'markdown',
          html: markdownToHtml(chunk, `markdown:${blocks.length}`),
          source: chunk,
        })
      }
    }

    const kind = match[1] ?? 'markdown'
    const fenceBody = match[2] ?? ''
    try {
      blocks.push(parseFence(kind, fenceBody, match[0], blocks.length))
    } catch (error) {
      rememberParseFailure(error, `${kind} block`, sourcePath, planId)
      throw error
    }
    cursor = index + match[0].length
  }

  if (cursor < body.length) {
    const chunk = body.slice(cursor)
    if (chunk.trim()) {
      blocks.push({
        type: 'markdown',
        html: markdownToHtml(chunk, `markdown:${blocks.length}`),
        source: chunk,
      })
    }
  }

  const titleFromMeta = meta.title ? String(meta.title) : undefined
  const titleFromHeading = body.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const title = titleFromMeta ?? titleFromHeading ?? 'Living plan'

  const interactionIds = blocks.flatMap((block) => {
    if (
      block.type === 'choice' ||
      block.type === 'approve' ||
      block.type === 'form' ||
      block.type === 'questions'
    ) {
      return [block.id]
    }
    return []
  })

  return {
    title,
    summary: meta.summary ? String(meta.summary) : undefined,
    agent: meta.agent ? String(meta.agent) : undefined,
    mode: meta.mode === 'review' ? 'review' : meta.mode === 'watch' ? 'watch' : undefined,
    sourcePath,
    source,
    blocks,
    interactionIds,
  }
}

export function collectSectionSources(plan: PlanDocument): string[] {
  return plan.blocks.map((block) => block.source.trim())
}

/** Scope shared by a block and the parts rendered inside it. */
export function planPartScope(block: PlanBlock, index: number): string {
  switch (block.type) {
    case 'markdown':
      return `markdown:${index}`
    case 'phase':
      return `phase:${block.id}`
    case 'callout':
      return `callout:${block.id ?? index}`
    case 'choice':
      return `choice:${block.id}`
    case 'approve':
      return `approve:${block.id}`
    case 'form':
      return `form:${block.id}`
    case 'questions':
      return `questions:${block.id}`
    case 'checklist':
      return `checklist:${block.id ?? index}`
    case 'workflow':
      return `workflow:${block.id}`
  }
}

/** Stable id used to link a workflow step back to a plan section. */
export function blockAnchorId(block: PlanBlock, index: number): string | undefined {
  switch (block.type) {
    case 'phase':
    case 'choice':
    case 'approve':
    case 'form':
    case 'questions':
    case 'workflow':
      return block.id
    case 'checklist':
      return block.id ?? (block.title ? `checklist-${slugify(block.title)}-${index}` : undefined)
    case 'callout':
      return block.id ?? (block.title ? `callout-${slugify(block.title)}-${index}` : undefined)
    case 'markdown':
      return undefined
  }
}
