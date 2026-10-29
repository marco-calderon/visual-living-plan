import { buildMdxOutline } from './planMdx/outline'
import { planRefHash, workflowStepHash } from './planRefNavigation'
import type { PlanBlock } from './types'

export type PlanTocKind = 'section' | 'workflow' | 'workflow-step'

export type PlanTocItem = {
  label: string
  depth: number
  kind: PlanTocKind
  /** Value passed to the plan or workflow history jump. */
  target: string
  href: string
  /** DOM id for a markdown heading, in document order. */
  headingId?: string
}

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
      return `<li><a href="${escapeAttr(item.href)}" data-toc="${item.kind}" data-toc-target="${escapeAttr(item.target)}" data-depth="${item.depth}">${escapeHtml(item.label)}</a></li>`
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
  for (const block of blocks) {
    if ('id' in block && block.id) used.add(`plan-${block.id}`)
  }
  const items: PlanTocItem[] = []
  const steps: PlanTocItem[] = []
  for (const block of blocks) {
    if (block.type === 'markdown') {
      items.push(...headingItems(block.html, used))
      continue
    }
    if (block.type === 'phase') {
      items.push(sectionItem(block.title, block.id, 0))
      items.push(...headingItems(block.bodyHtml, used))
      continue
    }
    if (block.type === 'callout') {
      if (block.id) items.push(sectionItem(block.title || block.kind, block.id, 0))
      items.push(...headingItems(block.bodyHtml, used))
      continue
    }
    if (block.type === 'choice') {
      items.push(sectionItem(block.prompt, block.id, 0))
      continue
    }
    if (block.type === 'form') {
      items.push(sectionItem(block.prompt, block.id, 0))
      continue
    }
    if (block.type === 'questions') {
      items.push(sectionItem(block.prompt || 'Questions', block.id, 0))
      continue
    }
    if (block.type === 'approve') {
      items.push(sectionItem(block.prompt, block.id, 0))
      items.push(...headingItems(block.bodyHtml, used))
      continue
    }
    if (block.type === 'checklist') {
      if (block.id) items.push(sectionItem(block.title || 'Checklist', block.id, 0))
      continue
    }
    for (const node of block.nodes) {
      const target = node.ref || node.id
      const label = (node.label || node.id).trim()
      if (!target || !label) continue
      steps.push({
        label,
        depth: 1,
        kind: 'workflow-step',
        target,
        href: workflowStepHash(target),
      })
    }
  }
  items.push({
    label: 'Workflow',
    depth: 0,
    kind: 'workflow',
    target: 'workflow',
    href: '#workflow',
  })
  items.push(...steps)
  return items
}

function sectionItem(label: string, id: string, depth: number): PlanTocItem {
  return {
    label: label.trim() || 'Section',
    depth,
    kind: 'section',
    target: id,
    href: planRefHash(id),
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
