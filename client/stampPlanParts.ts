import { dataTableCellPartId, isDataTableCellToken, markdownCellPartId } from '../src/planMdx/cellPart.ts'

type ProseCounts = {
  heading: number
  paragraph: number
  'list-item': number
  diagram: number
  code: number
}

type Counts = ProseCounts & {
  cell: number
  dataTable: number
}

function freshCounts(): Counts {
  return { heading: 0, paragraph: 0, 'list-item': 0, diagram: 0, code: 0, cell: 0, dataTable: 0 }
}

/** Mark the rendered MDX plan so comments can grab a heading, paragraph, option, entry, or table cell. */
export function stampPlanParts(root: ParentNode): void {
  const article = root.querySelector<HTMLElement>('[data-plan-rendered]') ?? (root instanceof HTMLElement ? root : null)
  if (!article) return
  let proseIndex = 0
  let inProse = false
  let counts = freshCounts()
  for (const child of [...article.children]) {
    if (!(child instanceof HTMLElement)) continue
    if (child.matches('[data-entry]') || child.querySelector(':scope > [data-entry]')) {
      if (inProse) proseIndex += 1
      inProse = false
      counts = freshCounts()
      stampTree(child)
      continue
    }
    if (!inProse) {
      inProse = true
      counts = freshCounts()
    }
    stampProse(child, `markdown:${proseIndex}`, counts)
    stampElementTables(child, `markdown:${proseIndex}`, counts)
  }
}

function stampTree(root: HTMLElement): void {
  const entries = root.matches('[data-entry]') ? [root] : []
  entries.push(...root.querySelectorAll<HTMLElement>('[data-entry]'))
  for (const entry of entries) stampEntry(entry)
}

function stampEntry(entry: HTMLElement): void {
  const kind = entry.dataset.entry || 'part'
  const id = entry.dataset.entryId
  const scope = id ? `${kind}:${id}` : kind
  entry.classList.add('block')
  if (!entry.dataset.planPart) {
    entry.dataset.planPart = scope
    entry.dataset.planKind = kind
  }
  const title = directChild(entry, '.plan-title, .plan-callout-label')
  if (title && !title.dataset.planPart) {
    const partKind = kind === 'callout' ? 'label' : kind === 'choice' || kind === 'form' || kind === 'questions' || kind === 'approve' ? 'prompt' : 'title'
    title.dataset.planPart = `${scope}/${partKind}`
    title.dataset.planKind = partKind
  }
  for (const option of entry.querySelectorAll<HTMLElement>('button[data-option-id]')) {
    if (option.closest('[data-entry]') !== entry) continue
    const optionId = option.dataset.optionId
    if (!optionId || option.dataset.planPart) continue
    option.dataset.planPart = `${scope}/option:${optionId}`
    option.dataset.planKind = 'option'
  }
  const rich = directChild(entry, '.plan-rich')
  if (rich) {
    const counts = freshCounts()
    for (const child of [...rich.children]) {
      if (!(child instanceof HTMLElement) || child.matches('[data-entry]')) continue
      stampProse(child, scope, counts)
      stampElementTables(child, scope, counts)
    }
  }
}

function stampProse(element: HTMLElement, scope: string, counts: Counts): void {
  if (element.matches('[data-entry]')) return
  const kind = proseKind(element)
  if (kind) {
    counts[kind] += 1
    if (!element.dataset.planPart) {
      element.dataset.planPart = `${scope}/${kind}:${counts[kind]}`
      element.dataset.planKind = kind
    }
  }
  if (element.tagName === 'UL' || element.tagName === 'OL') {
    for (const item of element.querySelectorAll<HTMLElement>(':scope > li')) stampProse(item, scope, counts)
  }
}

function stampElementTables(element: HTMLElement, scope: string, counts: Counts): void {
  const hostEntry = element.closest('[data-entry]')
  for (const table of elementsWithClass(element, 'rich-table')) {
    if (table.closest('[data-entry]') !== hostEntry) continue
    for (const cell of table.querySelectorAll<HTMLElement>('th, td')) {
      if (cell.closest('.rich-table') !== table) continue
      counts.cell += 1
      assignCell(cell, markdownCellPartId(scope, counts.cell))
    }
  }
  for (const table of elementsWithClass(element, 'plan-data-table')) {
    if (table.closest('[data-entry]') !== hostEntry) continue
    counts.dataTable += 1
    const index = counts.dataTable
    for (const cell of table.querySelectorAll<HTMLElement>('[data-plan-cell]')) {
      if (cell.closest('.plan-data-table') !== table) continue
      const token = cell.dataset.planCell ?? ''
      if (!isDataTableCellToken(token)) continue
      assignCell(cell, dataTableCellPartId(scope, index, token))
    }
  }
}

function assignCell(cell: HTMLElement, partId: string): void {
  if (partId.length > 200) return
  cell.dataset.planPart = partId
  cell.dataset.planKind = 'cell'
}

function elementsWithClass(element: HTMLElement, className: string): HTMLElement[] {
  const found: HTMLElement[] = []
  if (element.classList.contains(className)) found.push(element)
  for (const node of element.querySelectorAll<HTMLElement>(`.${className}`)) {
    if (!found.includes(node)) found.push(node)
  }
  return found
}

function proseKind(element: HTMLElement): keyof ProseCounts | null {
  if (/^H[1-6]$/.test(element.tagName)) return 'heading'
  if (element.tagName === 'P') return 'paragraph'
  if (element.tagName === 'LI') return 'list-item'
  if (element.classList.contains('mermaid-diagram')) return 'diagram'
  if (element.tagName === 'PRE' || element.classList.contains('code-block')) return 'code'
  return null
}

function directChild(entry: HTMLElement, selector: string): HTMLElement | null {
  const found = entry.querySelector<HTMLElement>(selector)
  if (!found || found.closest('[data-entry]') !== entry) return null
  return found
}
