import { buildMdxOutline } from './planMdx/outline'
import { phaseStatus } from './planMdx/payload'
import { planRefHash, workflowStepHash } from './planRefNavigation'
import type { PhaseStatus, PlanBlock, WorkflowNodeSpec } from './types'

export type PlanTocKind = 'section' | 'workflow' | 'workflow-step'

export type PlanTocIcon =
  | 'heading'
  | 'workflow'
  | 'choice'
  | 'form'
  | 'questions'
  | 'approve'
  | 'checklist'
  | `phase-${PhaseStatus}`
  | `callout-${'note' | 'tip' | 'risk' | 'decision' | 'warning'}`

export type PlanTocItem = {
  label: string
  depth: number
  kind: PlanTocKind
  /** Value passed to the plan or workflow history jump. */
  target: string
  href: string
  /** DOM id for a markdown heading, in document order. */
  headingId?: string
  icon: PlanTocIcon
  /** Step glyph follows phase or execution progress. */
  tracksProgress?: boolean
}

const PHASE_PROGRESS: readonly PhaseStatus[] = ['pending', 'active', 'done', 'blocked', 'failed']

function headingTag(): RegExp {
  return /<h([1-3])\b([^>]*)>([\s\S]*?)<\/h\1>/gi
}

/** Sections of a plan, then the Workflow page and its steps. */
export function buildPlanToc(source: string): PlanTocItem[] {
  const outline = buildMdxOutline(stripFrontmatter(source))
  return planTocFromBlocks(outline.blocks)
}

export function planTocHeadingIds(items: readonly PlanTocItem[]): string[] {
  return items.flatMap((item) => (item.headingId ? [item.headingId] : []))
}

/** Give markdown headings the ids the contents list points at. */
export function stampPlanHeadingIds(html: string, items: readonly PlanTocItem[]): string {
  const ids = planTocHeadingIds(items)
  let index = 0
  return html.replace(headingTag(), (match, level: string, attrs: string) => {
    if (!/\bdata-plan-kind="heading"/.test(attrs) || /\bid=/.test(attrs)) return match
    const id = ids[index]
    index += 1
    if (!id) return match
    return `<h${level}${attrs} id="${escapeAttr(id)}">`
  })
}

export function renderTocItemsHtml(items: readonly PlanTocItem[]): string {
  return items
    .map((item) => {
      const step = item.tracksProgress ? ' data-toc-step' : ''
      return `<li><a href="${escapeAttr(item.href)}" data-toc="${item.kind}" data-toc-target="${escapeAttr(item.target)}" data-toc-icon="${item.icon}"${step} data-depth="${item.depth}"><span class="plan-toc-icon" aria-hidden="true">${tocIconHtml(item)}</span><span class="plan-toc-label">${escapeHtml(item.label)}</span></a></li>`
    })
    .join('')
}

const TOC_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>'

/** Contents chrome. It is a sibling of the plan column, not a child of it. */
export function renderPlanTocHtml(items: readonly PlanTocItem[]): string {
  return `<nav id="plan-toc" class="plan-toc" aria-label="Contents" data-open="false" tabindex="-1" inert data-plan-grab-ignore>
  <ul class="plan-toc-list" id="plan-toc-list">${renderTocItemsHtml(items)}</ul>
</nav>
<button type="button" class="plan-toc-backdrop" id="plan-toc-backdrop" hidden data-plan-grab-ignore aria-label="Close contents"></button>
<button type="button" class="plan-toc-toggle" data-toc-toggle aria-expanded="false" aria-controls="plan-toc" data-plan-grab-ignore>${TOC_ICON}<span class="sr">Contents</span></button>`
}

function planTocFromBlocks(blocks: PlanBlock[]): PlanTocItem[] {
  const used = new Set<string>()
  const marks = new Map<string, TocMark>()
  for (const block of blocks) {
    if ('id' in block && block.id) {
      used.add(`plan-${block.id}`)
      const mark = markForBlock(block)
      if (mark) marks.set(block.id, mark)
    }
  }
  const items: PlanTocItem[] = []
  const steps: PlanTocItem[] = []
  for (const block of blocks) {
    if (block.type === 'markdown') {
      items.push(...headingItems(block.html, used))
      continue
    }
    if (block.type === 'phase') {
      items.push(sectionItem(block.title, block.id, 0, markForBlock(block)))
      items.push(...headingItems(block.bodyHtml, used))
      continue
    }
    if (block.type === 'callout') {
      if (block.id) items.push(sectionItem(block.title || block.kind, block.id, 0, markForBlock(block)))
      items.push(...headingItems(block.bodyHtml, used))
      continue
    }
    if (block.type === 'choice') {
      items.push(sectionItem(block.prompt, block.id, 0, markForBlock(block)))
      continue
    }
    if (block.type === 'form') {
      items.push(sectionItem(block.prompt, block.id, 0, markForBlock(block)))
      continue
    }
    if (block.type === 'questions') {
      items.push(sectionItem(block.prompt || 'Questions', block.id, 0, markForBlock(block)))
      continue
    }
    if (block.type === 'approve') {
      items.push(sectionItem(block.prompt, block.id, 0, markForBlock(block)))
      items.push(...headingItems(block.bodyHtml, used))
      continue
    }
    if (block.type === 'checklist') {
      if (block.id) items.push(sectionItem(block.title || 'Checklist', block.id, 0, markForBlock(block)))
      continue
    }
    for (const node of block.nodes) {
      const target = node.ref || node.id
      const label = (node.label || node.id).trim()
      if (!target || !label) continue
      const mark = stepMark(node, marks.get(target))
      steps.push({
        label,
        depth: 1,
        kind: 'workflow-step',
        target,
        href: workflowStepHash(target),
        icon: mark.icon,
        tracksProgress: mark.tracksProgress,
      })
    }
  }
  items.push({
    label: 'Workflow',
    depth: 0,
    kind: 'workflow',
    target: 'workflow',
    href: '#workflow',
    icon: 'workflow',
  })
  items.push(...steps)
  return items
}

type TocMark = { icon: PlanTocIcon; tracksProgress?: boolean }

function markForBlock(block: PlanBlock): TocMark {
  switch (block.type) {
    case 'phase':
      return { icon: `phase-${block.status}`, tracksProgress: true }
    case 'callout':
      return { icon: `callout-${block.kind}` }
    case 'choice':
      return { icon: 'choice' }
    case 'form':
      return { icon: 'form' }
    case 'questions':
      return { icon: 'questions' }
    case 'approve':
      return { icon: 'approve' }
    case 'checklist':
      return { icon: 'checklist' }
    case 'workflow':
      return { icon: 'workflow' }
    case 'markdown':
      return { icon: 'heading' }
  }
}

function stepMark(node: WorkflowNodeSpec, linked: TocMark | undefined): TocMark {
  if (linked?.tracksProgress) {
    const status = node.status ? phaseStatus(node.status) : undefined
    return { icon: status ? `phase-${status}` : linked.icon, tracksProgress: true }
  }
  if (linked) return linked
  return { icon: `phase-${phaseStatus(node.status)}`, tracksProgress: true }
}

function sectionItem(label: string, id: string, depth: number, mark: TocMark): PlanTocItem {
  return {
    label: label.trim() || 'Section',
    depth,
    kind: 'section',
    target: id,
    href: planRefHash(id),
    icon: mark.icon,
    tracksProgress: mark.tracksProgress,
  }
}

function headingItems(html: string, used: Set<string>): PlanTocItem[] {
  const items: PlanTocItem[] = []
  for (const match of html.matchAll(headingTag())) {
    const attrs = match[2] ?? ''
    if (!/\bdata-plan-kind="heading"/.test(attrs)) continue
    const level = Number(match[1])
    const label = htmlText(match[3] ?? '')
    if (!label) continue
    const headingId = allocateHeadingId(label, used)
    items.push({
      label,
      depth: Math.max(0, Math.min(2, level - 1)),
      kind: 'section',
      target: headingId,
      href: `#${encodeURIComponent(headingId)}`,
      headingId,
      icon: 'heading',
    })
  }
  return items
}

function allocateHeadingId(label: string, used: Set<string>): string {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'section'
  let id = `plan-${slug}`
  let suffix = 2
  while (used.has(id)) {
    id = `plan-${slug}-${suffix}`
    suffix += 1
  }
  used.add(id)
  return id
}

const TOC_CHECK =
  '<path d="m8 12.5 2.5 2.5 5.5-6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'

function tocSvg(body: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
}

const TOC_ICONS: Record<Exclude<PlanTocIcon, 'heading'>, string> = {
  'phase-pending': tocSvg('<circle cx="12" cy="12" r="8"/>'),
  'phase-active': tocSvg(
    '<circle cx="12" cy="12" r="8" opacity="0.28"/><circle cx="12" cy="12" r="8" pathLength="100" stroke-dasharray="32 68" transform="rotate(-90 12 12)"/>',
  ),
  'phase-done': tocSvg(`<circle cx="12" cy="12" r="8" fill="currentColor" stroke="none"/>${TOC_CHECK}`),
  'phase-blocked': tocSvg('<circle cx="12" cy="12" r="8"/><path d="M10 9v6"/><path d="M14 9v6"/>'),
  'phase-failed': tocSvg('<circle cx="12" cy="12" r="8"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>'),
  'callout-risk': tocSvg(
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  ),
  'callout-warning': tocSvg(
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  ),
  'callout-decision': tocSvg('<rect width="16" height="16" x="4" y="4" rx="3"/>'),
  'callout-note': tocSvg('<circle cx="12" cy="12" r="8"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  'callout-tip': tocSvg(
    '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  ),
  choice: tocSvg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>'),
  form: tocSvg(
    '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  ),
  questions: tocSvg('<circle cx="12" cy="12" r="8"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  approve: tocSvg(`<rect width="16" height="16" x="4" y="4" rx="4" fill="currentColor" stroke="none"/>${TOC_CHECK}`),
  checklist: tocSvg(
    '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  ),
  workflow: tocSvg(
    '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
  ),
}

function tocIconHtml(item: PlanTocItem): string {
  if (item.icon === 'heading') return ''
  if (!item.tracksProgress) return TOC_ICONS[item.icon]
  return PHASE_PROGRESS.map((status) => {
    const icon = `phase-${status}` as const
    return `<span data-icon="${icon}">${TOC_ICONS[icon]}</span>`
  }).join('')
}

function htmlText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripFrontmatter(source: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(source)
  return match ? source.slice(match[0].length) : source
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;')
}
