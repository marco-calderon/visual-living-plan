import type { Node } from '@markdoc/markdoc'

export const ENTRY_TAGS = new Set([
  'phase',
  'callout',
  'choice',
  'approve',
  'form',
  'questions',
  'checklist',
  'workflow',
])

export function isEntry(node: Node): boolean {
  return node.type === 'tag' && Boolean(node.tag && ENTRY_TAGS.has(node.tag))
}

export function lineSpan(node: Node): { start: number; end: number } | null {
  if (!node.lines.length) return null
  const start = node.lines[0] ?? 0
  const end = node.lines[node.lines.length - 1] ?? start
  return { start, end: Math.max(end, start) }
}

export function sliceSource(source: string, start: number, end: number): string {
  return source.split('\n').slice(start, end).join('\n')
}

export function nodesSource(nodes: Node[], source: string): string {
  const spans = nodes.map(lineSpan).filter((span): span is { start: number; end: number } => span !== null)
  if (spans.length === 0) return ''
  const start = Math.min(...spans.map((span) => span.start))
  const end = Math.max(...spans.map((span) => span.end))
  return sliceSource(source, start, end)
}

export type PlanSection =
  | { kind: 'prose'; nodes: Node[]; source: string }
  | { kind: 'entry'; node: Node; source: string }

/** Top-level tags are sections. Consecutive markdown is one section, matching the old fence split. */
export function planSections(doc: Node, source: string): PlanSection[] {
  const sections: PlanSection[] = []
  let prose: Node[] = []
  const flush = () => {
    if (prose.length === 0) return
    sections.push({ kind: 'prose', nodes: prose, source: nodesSource(prose, source) })
    prose = []
  }
  for (const child of doc.children) {
    if (isEntry(child)) {
      flush()
      sections.push({ kind: 'entry', node: child, source: nodesSource([child], source) })
      continue
    }
    prose.push(child)
  }
  flush()
  return sections
}
