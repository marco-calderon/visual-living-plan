type Attribute = { type: string; name?: string; value?: unknown }

type MdNode = {
  type: string
  name?: string | null
  position?: { start?: { offset?: number; column?: number }; end?: { offset?: number } }
  children?: MdNode[]
  attributes?: Attribute[]
  data?: { hProperties?: Record<string, unknown> } & Record<string, unknown>
}

/** The attribute that carries a block's place in the plan's MDX: `start-end` offsets. */
export const BLOCK_RANGE_ATTR = 'data-plan-block'

/** The attribute that carries the place of a pipe table cell's text, so a click edits that cell alone. Empty cells have `n-n`. */
export const CELL_RANGE_ATTR = 'data-plan-cell-range'

/** Nodes the page draws as a block of their own. Definitions, ESM, and expressions are not edited. */
const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'list',
  'blockquote',
  'code',
  'table',
  'thematicBreak',
  'mdxJsxFlowElement',
])

/** Blocks whose own blocks are edited one by one too: a phase's paragraphs, code, and cards. */
const CONTAINERS = new Set(['phase'])

/** Each cell of a pipe table gets the place of its text: from its first child to its last, or where text would go. */
function stampCells(table: MdNode, source: string): void {
  for (const row of table.children ?? []) {
    for (const cell of row.children ?? []) {
      if (cell.type !== 'tableCell') continue
      const first = cell.children?.[0]?.position?.start?.offset
      const last = cell.children?.[cell.children.length - 1]?.position?.end?.offset
      let start: number | undefined
      let end: number | undefined
      if (typeof first === 'number' && typeof last === 'number' && last >= first) {
        start = first
        end = last
      } else {
        // An empty cell: text goes after its pipe and one space.
        let at = cell.position?.start?.offset
        if (typeof at !== 'number') continue
        if (source[at] === '|') at += 1
        if (source[at] === ' ') at += 1
        start = at
        end = at
      }
      const data = cell.data ?? {}
      cell.data = { ...data, hProperties: { ...(data.hProperties ?? {}), [CELL_RANGE_ATTR]: `${start}-${end}` } }
    }
  }
}

function stamp(nodes: MdNode[] | undefined, nested: boolean, source: string): void {
  for (const node of nodes ?? []) {
    if (!BLOCK_TYPES.has(node.type)) continue
    const start = node.position?.start?.offset
    const end = node.position?.end?.offset
    if (typeof start !== 'number' || typeof end !== 'number' || end <= start) continue
    // An indented block inside a card would lose its indentation when edited on its own. The card is edited whole.
    if (nested && node.position?.start?.column !== 1) continue
    const value = `${start}-${end}`
    if (node.type === 'mdxJsxFlowElement') {
      node.attributes = [...(node.attributes ?? []), { type: 'mdxJsxAttribute', name: BLOCK_RANGE_ATTR, value }]
      if (node.name && CONTAINERS.has(node.name)) stamp(node.children, true, source)
      continue
    }
    if (node.type === 'table') stampCells(node, source)
    const data = node.data ?? {}
    node.data = { ...data, hProperties: { ...(data.hProperties ?? {}), [BLOCK_RANGE_ATTR]: value } }
  }
}

/**
 * Mark each block with where it is in the plan's MDX (ADR 0040), so the page can edit that block
 * in place and splice the edit back into the file. Top-level blocks are marked, and so are the
 * blocks inside a phase. A JSX block gets the range as an attribute; markdown gets it on the
 * element it renders to (a fence on its `<code>`).
 */
export function remarkBlockRanges() {
  return (tree: MdNode, file?: { value?: unknown }) => stamp(tree.children, false, String(file?.value ?? ''))
}

/** `120-344` as numbers, or null. */
export function parseBlockRange(value: unknown): { start: number; end: number } | null {
  if (typeof value !== 'string') return null
  const match = /^(\d+)-(\d+)$/.exec(value)
  if (!match) return null
  const start = Number(match[1])
  const end = Number(match[2])
  return end > start ? { start, end } : null
}

/**
 * Where the MDX the page compiles starts in the plan file. The page compiles the body after the
 * front matter, trimmed (src/planMdx/source.ts `planSourceToMdx`), so a block's offsets are relative
 * to that text.
 */
export function mdxBodyOffset(source: string): number {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(source)
  const body = match ? source.slice(match[0].length) : source
  const lead = body.length - body.trimStart().length
  return source.length - body.length + lead
}

/** `120-131` as numbers, or null. A cell's range can be empty (`120-120`), where an empty cell's text goes. */
export function parseCellRange(value: unknown): { start: number; end: number } | null {
  if (typeof value !== 'string') return null
  const match = /^(\d+)-(\d+)$/.exec(value)
  if (!match) return null
  const start = Number(match[1])
  const end = Number(match[2])
  return end >= start ? { start, end } : null
}

/** Replace one block of a plan file (by its range in the compiled MDX) with new text. */
export function spliceBlock(source: string, range: { start: number; end: number }, text: string): string {
  const offset = mdxBodyOffset(source)
  const start = offset + range.start
  const end = offset + range.end
  const before = source.slice(0, start)
  const after = source.slice(end)
  const next = text.trim()
  if (!next) {
    // A removed block takes the blank line after it too, so the file keeps one blank line between blocks.
    return `${before.replace(/\n+$/, '\n')}${after.replace(/^\n+/, '\n')}`.replace(/^\n+/, '')
  }
  return `${before}${next}${after}`
}

/** Add a new block after the block at `range`, or at the end of the plan when `range` is null. */
export function insertBlockAfter(source: string, range: { start: number; end: number } | null, text: string): string {
  const next = text.trim()
  if (!next) return source
  if (!range) return `${source.replace(/\s*$/, '')}\n\n${next}\n`
  const at = mdxBodyOffset(source) + range.end
  return `${source.slice(0, at)}\n\n${next}${source.slice(at)}`
}

/** A block's text in the plan file. */
export function blockText(source: string, range: { start: number; end: number }): string {
  const offset = mdxBodyOffset(source)
  return source.slice(offset + range.start, offset + range.end)
}
