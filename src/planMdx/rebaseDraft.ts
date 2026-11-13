import { fromMarkdown } from 'mdast-util-from-markdown'
import { mdxFromMarkdown } from 'mdast-util-mdx'
import { mdxjs } from 'micromark-extension-mdxjs'
import type { Code, Root, RootContent } from 'mdast'
import type { MdxJsxAttribute, MdxJsxExpressionAttribute, MdxJsxFlowElement } from 'mdast-util-mdx-jsx'
import { workflowNodeCells } from '../workflowSource'
import { splitFrontmatter, topEntryIds, wireNewSteps } from './editSource'

/**
 * Bring a person's unapplied block edits onto a plan the agent wrote meanwhile (ADR 0040).
 *
 * A three-way merge by block, at the grain the page edits by: the plan's top-level blocks, and
 * the blocks directly inside a `<phase>`. `base` is the plan the edits started from, `mine` is
 * that plan with the edits, and `theirs` is the plan the agent wrote since. The result is
 * `theirs` with the person's edits on top; every byte of `theirs` they do not touch stays as written.
 */

export type DraftSide = 'mine' | 'theirs'

/** A block both sides changed, each in its own way. The merged source keeps the agent's. */
export type DraftConflict = {
  /** Names this block for `keep`. The same base and mine give the same key whatever the agent writes. */
  key: string
  /** The block's heading text, card title, or first line. */
  label: string
  /** The phase the block sits in, when it is inside one. */
  within?: string
  /** The block's text in the person's version, or '' when they removed it. */
  mine: string
  /** The block's text in the agent's version, or '' when the agent removed it. */
  theirs: string
  /** A short plain-text line of the person's version, for the Apply bar. */
  minePreview: string
}

export type RebaseInput = {
  base: string
  mine: string
  theirs: string
  /** The side to keep for a conflict, by its key. A conflict with no choice keeps the agent's. */
  keep?: Readonly<Record<string, DraftSide>>
}

export type RebaseResult = {
  source: string
  /** The overlapping blocks `keep` does not settle. */
  conflicts: DraftConflict[]
}

/** Plan cards that keep their identity by `id` while their content changes. */
const CARD_TAGS = new Set(['phase', 'choice', 'form', 'questions', 'approve', 'checklist', 'callout', 'workflow'])

type Block = {
  start: number
  end: number
  node: RootContent
  /** The block's meaning without its spacing (src/planMdx/editSource.ts `canonical`). */
  key: string
  /** `phase#build` for a plan card with an id. */
  card?: string
  /** What the block is matched by: its card, else its meaning. */
  ident: string
  /** Two changed versions of one block have the same shape. */
  shape: string
}

/** One version's run of sibling blocks: the plan body, or the inside of a phase. */
type Region = { text: string; blocks: Block[]; from: number; to: number }

type Context = {
  keep: Readonly<Record<string, DraftSide>>
  conflicts: DraftConflict[]
  /** Card ids the person added, for the workflow check. */
  newIds: Set<string>
  /** The person's workflow change was only the steps for their new cards; wire them again after the merge. */
  rewire: boolean
}

function parse(markdown: string): Root {
  return fromMarkdown(markdown, { extensions: [mdxjs()], mdastExtensions: [mdxFromMarkdown()] })
}

/** The syntax tree with positions dropped, as src/planMdx/editSource.ts compares blocks. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'position' || key === 'data' || inner === null || inner === undefined) continue
    out[key] = canonical(inner)
  }
  return out
}

function keyOf(value: unknown): string {
  return JSON.stringify(canonical(value))
}

function isFlowJsx(node: RootContent): node is MdxJsxFlowElement {
  return node.type === 'mdxJsxFlowElement'
}

function attr(node: MdxJsxFlowElement, name: string): string | undefined {
  for (const attribute of node.attributes) {
    if (attribute.type === 'mdxJsxAttribute' && attribute.name === name && typeof attribute.value === 'string') {
      return attribute.value
    }
  }
  return undefined
}

function shapeOf(node: RootContent): string {
  if (node.type === 'heading') return `heading${node.depth}`
  if (node.type === 'list') return node.ordered ? 'list-ordered' : 'list'
  if (isFlowJsx(node)) return `jsx:${node.name ?? ''}`
  return node.type
}

function toBlocks(nodes: readonly RootContent[]): Block[] {
  return nodes.flatMap((node) => {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start === undefined || end === undefined) return []
    const key = keyOf(node)
    const id = isFlowJsx(node) && node.name && CARD_TAGS.has(node.name) ? attr(node, 'id') : undefined
    const card = id && isFlowJsx(node) ? `${node.name}#${id}` : undefined
    return [{ start, end, node, key, card, ident: card ?? `=${key}`, shape: shapeOf(node) }]
  })
}

function textOf(region: Region, block: Block): string {
  return region.text.slice(block.start, block.end)
}

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
}

/** How alike two texts read, 0 to 1, by the words they share. */
function similarity(a: string, b: string): number {
  const left = words(a)
  const right = words(b)
  if (left.size === 0 && right.size === 0) return 1
  let shared = 0
  for (const word of left) if (right.has(word)) shared += 1
  return (2 * shared) / (left.size + right.size)
}

/**
 * For each base block, the index of the same block in `other`, or undefined when `other` has no
 * such block. Cards match by id, other blocks by meaning, in order. A block that changed in place
 * matches the block of the same shape between the same neighbours that reads most like it.
 * `moves` also matches a block that only moved, by meaning.
 */
function matchBlocks(base: Region, other: Region, moves: boolean): Array<number | undefined> {
  const n = base.blocks.length
  const m = other.blocks.length
  const matched: Array<number | undefined> = new Array(n).fill(undefined)
  const used = new Set<number>()

  // Longest run of the same blocks, in order.
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i]![j] =
        base.blocks[i]!.ident === other.blocks[j]!.ident ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
    }
  }
  const anchors: Array<[number, number]> = []
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (base.blocks[i]!.ident === other.blocks[j]!.ident) {
      anchors.push([i, j])
      matched[i] = j
      used.add(j)
      i += 1
      j += 1
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      i += 1
    } else {
      j += 1
    }
  }

  // A card keeps its id wherever it went.
  const claim = (test: (block: Block, index: number) => boolean) => {
    for (let i = 0; i < n; i++) {
      if (matched[i] !== undefined) continue
      const j = other.blocks.findIndex((block, index) => !used.has(index) && test(block, i))
      if (j < 0) continue
      matched[i] = j
      used.add(j)
    }
  }
  claim((block, i) => base.blocks[i]!.card !== undefined && block.card === base.blocks[i]!.card)
  if (moves) claim((block, i) => block.key === base.blocks[i]!.key)

  // Between two matched neighbours, pair the blocks that changed in place.
  const bounds: Array<[number, number]> = [[-1, -1], ...anchors, [n, m]]
  for (let k = 0; k + 1 < bounds.length; k++) {
    const [fromI, fromJ] = bounds[k]!
    const [toI, toJ] = bounds[k + 1]!
    const left: number[] = []
    const right: number[] = []
    for (let i = fromI + 1; i < toI; i++) if (matched[i] === undefined) left.push(i)
    for (let j = fromJ + 1; j < toJ; j++) if (!used.has(j)) right.push(j)
    for (const [i, j] of alignChanged(base, left, other, right)) {
      matched[i] = j
      used.add(j)
    }
  }
  return matched
}

/** Pair blocks of the same shape, in order, most pairs first and then the most alike. */
function alignChanged(base: Region, left: number[], other: Region, right: number[]): Array<[number, number]> {
  if (left.length === 0 || right.length === 0) return []
  const pairScore = (i: number, j: number): number => {
    const a = base.blocks[left[i]!]!
    const b = other.blocks[right[j]!]!
    if (a.shape !== b.shape) return Number.NEGATIVE_INFINITY
    return 1 + similarity(textOf(base, a), textOf(other, b))
  }
  const rows = left.length
  const cols = right.length
  const score: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0))
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      score[i]![j] = Math.max(score[i + 1]![j]!, score[i]![j + 1]!, pairScore(i, j) + score[i + 1]![j + 1]!)
    }
  }
  const pairs: Array<[number, number]> = []
  for (let i = 0, j = 0; i < rows && j < cols; ) {
    const here = score[i]![j]!
    const pair = pairScore(i, j)
    if (pair !== Number.NEGATIVE_INFINITY && here === pair + score[i + 1]![j + 1]!) {
      pairs.push([left[i]!, right[j]!])
      i += 1
      j += 1
    } else if (here === score[i + 1]![j]!) {
      i += 1
    } else {
      j += 1
    }
  }
  return pairs
}

function invert(matched: Array<number | undefined>, size: number): Array<number | undefined> {
  const out: Array<number | undefined> = new Array(size).fill(undefined)
  matched.forEach((j, i) => {
    if (j !== undefined) out[j] = i
  })
  return out
}

function plainText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const value = node as { type?: string; value?: unknown; children?: unknown[] }
  if ((value.type === 'text' || value.type === 'inlineCode' || value.type === 'code') && typeof value.value === 'string') {
    return value.value
  }
  return Array.isArray(value.children) ? value.children.map(plainText).join(' ') : ''
}

/** One line of at most `max` characters, cut at a word when there is one near the end. */
function short(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim()
  if (line.length <= max) return line
  const cut = line.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** The block's heading text, card title, or first line. */
function labelOf(region: Region, block: Block): string {
  const node = block.node
  if (isFlowJsx(node)) {
    const named = attr(node, 'title') ?? attr(node, 'prompt') ?? attr(node, 'label') ?? attr(node, 'id')
    if (named) return short(named, 60)
    const text = plainText(node)
    if (text.trim()) return short(text.split('\n').find((line) => line.trim()) ?? text, 60)
    return `<${node.name ?? 'block'}>`
  }
  if (node.type === 'heading') return short(plainText(node), 60)
  if (node.type === 'code') {
    const first = node.value.split('\n').find((line) => line.trim())
    return short(first ?? `${node.lang ?? 'Code'} block`, 60)
  }
  const first = (plainText(node) || textOf(region, block)).split('\n').find((line) => line.trim()) ?? ''
  return short(first, 60) || short(textOf(region, block), 60)
}

const PREVIEW = 90

/**
 * A line of the person's version for the Apply bar. A long block shows the part where it starts to
 * differ from `was` (the block before the person changed it), so the line shows what they wrote.
 */
function previewOf(region: Region, block: Block, was?: Block): string {
  const own = plainText(block.node).replace(/\s+/g, ' ').trim()
  if (!own) return short(labelOf(region, block), PREVIEW)
  if (own.length <= PREVIEW || !was) return short(own, PREVIEW)
  const other = plainText(was.node).replace(/\s+/g, ' ').trim()
  let at = 0
  while (at < own.length && at < other.length && own[at] === other[at]) at += 1
  // Start a few words before the first difference, at a word.
  let start = Math.max(0, Math.min(at - 30, own.length - PREVIEW))
  if (start > 0) {
    const space = own.indexOf(' ', start)
    start = space < 0 || space >= at ? start : space + 1
  }
  if (start === 0) return short(own, PREVIEW)
  return short(`…${own.slice(start)}`, PREVIEW)
}

type Item = { kind: 'theirs'; index: number; text: string } | { kind: 'new'; text: string }

/** A gap that separates two blocks, or a blank line when it would join them. */
function blankGap(gap: string | undefined): string {
  return gap !== undefined && /\n[ \t]*\n/.test(gap) ? gap : '\n\n'
}

/** The merged region: theirs, with its own spacing wherever two of its blocks stay neighbours. */
function assemble(theirs: Region, items: Item[], top: boolean): string {
  const { text, blocks } = theirs
  if (blocks.length === 0) {
    if (items.length === 0) return text.slice(theirs.from, theirs.to)
    return `${top ? '' : '\n'}${items.map((item) => item.text).join('\n\n')}\n`
  }
  const gap = (index: number): string | undefined =>
    index >= 0 && index + 1 < blocks.length ? text.slice(blocks[index]!.end, blocks[index + 1]!.start) : undefined
  const lead = text.slice(theirs.from, blocks[0]!.start)
  const trail = text.slice(blocks[blocks.length - 1]!.end, theirs.to)
  if (items.length === 0) return top ? `${lead}${trail}` : '\n'
  let out = lead
  let previous: Item | null = null
  for (const item of items) {
    if (previous) {
      if (previous.kind === 'theirs' && item.kind === 'theirs' && item.index === previous.index + 1) out += gap(previous.index) ?? '\n\n'
      else if (item.kind === 'new') out += '\n\n'
      else if (previous.kind === 'theirs') out += blankGap(gap(previous.index))
      else out += blankGap(gap(item.index - 1))
    }
    out += item.text
    previous = item
  }
  return `${out}${trail}`
}

function conflict(context: Context, entry: DraftConflict): DraftSide {
  const chosen = context.keep[entry.key]
  if (chosen) return chosen
  context.conflicts.push(entry)
  return 'theirs'
}

/** Merge one run of sibling blocks. `path` prefixes the conflict keys; `within` names the phase. */
function mergeRegion(context: Context, base: Region, mine: Region, theirs: Region, path: string, within: string | undefined, top: boolean): string {
  const toMine = matchBlocks(base, mine, false)
  const toTheirs = matchBlocks(base, theirs, true)
  const mineBase = invert(toMine, mine.blocks.length)
  const theirsBase = invert(toTheirs, theirs.blocks.length)

  // What goes in each of theirs' blocks; null takes it out.
  const out: Array<string | null> = theirs.blocks.map((block) => textOf(theirs, block))
  // Base blocks the agent removed and the person changed, then kept.
  const restored = new Set<number>()
  const where = within ? { within } : {}

  for (const [index, block] of base.blocks.entries()) {
    const mi = toMine[index]
    const ti = toTheirs[index]
    const mineBlock = mi === undefined ? undefined : mine.blocks[mi]
    const theirsBlock = ti === undefined ? undefined : theirs.blocks[ti]
    const key = `${path}${index}`
    let mineSame = mineBlock !== undefined && mineBlock.key === block.key
    if (!mineSame && mineBlock && top && wiringOnly(block, mineBlock, context.newIds)) {
      // The person only added cards; their steps are wired again onto the agent's workflow below.
      mineSame = true
      context.rewire = true
    }
    if (mineBlock && mineSame) continue
    const theirsSame = theirsBlock !== undefined && theirsBlock.key === block.key

    if (!mineBlock) {
      // The person removed it.
      if (ti === undefined || !theirsBlock) continue
      if (theirsSame) {
        out[ti] = null
        continue
      }
      const side = conflict(context, {
        key,
        label: labelOf(theirs, theirsBlock),
        ...where,
        mine: '',
        theirs: textOf(theirs, theirsBlock),
        minePreview: '',
      })
      if (side === 'mine') out[ti] = null
      continue
    }

    // The person changed it.
    if (ti === undefined || !theirsBlock) {
      const side = conflict(context, {
        key,
        label: labelOf(mine, mineBlock),
        ...where,
        mine: textOf(mine, mineBlock),
        theirs: '',
        minePreview: previewOf(mine, mineBlock, block),
      })
      if (side === 'mine') restored.add(index)
      continue
    }
    if (theirsSame) {
      out[ti] = textOf(mine, mineBlock)
      continue
    }
    // Both changed it. The same change is no conflict.
    if (theirsBlock.key === mineBlock.key) continue
    const nested = mergePhase(context, base, block, mine, mineBlock, theirs, theirsBlock, `${key}.`)
    if (nested !== undefined) {
      out[ti] = nested
      continue
    }
    const side = conflict(context, {
      key,
      label: labelOf(theirs, theirsBlock),
      ...where,
      mine: textOf(mine, mineBlock),
      theirs: textOf(theirs, theirsBlock),
      minePreview: previewOf(mine, mineBlock, block),
    })
    if (side === 'mine') out[ti] = textOf(mine, mineBlock)
  }

  // The person's new blocks go after the block before them that the agent's plan still has.
  const added = new Map<number | 'start', string[]>()
  const place = (anchor: number | 'start', text: string) => added.set(anchor, [...(added.get(anchor) ?? []), text])
  const theirsNew = theirs.blocks.map((_, index) => theirsBase[index] === undefined)
  const claimed = new Set<number>()
  let anchor: number | 'start' = 'start'
  for (const [index, block] of mine.blocks.entries()) {
    const bi = mineBase[index]
    if (bi !== undefined) {
      const ti = toTheirs[bi]
      if (ti !== undefined) anchor = ti
      else if (restored.has(bi)) place(anchor, textOf(mine, block))
      continue
    }
    // Both added a card with this id.
    if (block.card) {
      const twin = theirs.blocks.findIndex((other, ti) => theirsNew[ti] && !claimed.has(ti) && other.card === block.card)
      if (twin >= 0) {
        claimed.add(twin)
        if (theirs.blocks[twin]!.key === block.key) continue
        const side = conflict(context, {
          key: `${path}new:${block.card}`,
          label: labelOf(theirs, theirs.blocks[twin]!),
          ...where,
          mine: textOf(mine, block),
          theirs: textOf(theirs, theirs.blocks[twin]!),
          minePreview: previewOf(mine, block, theirs.blocks[twin]),
        })
        if (side === 'mine') out[twin] = textOf(mine, block)
        continue
      }
    }
    // Both added the same block.
    const same = theirs.blocks.findIndex((other, ti) => theirsNew[ti] && !claimed.has(ti) && other.key === block.key)
    if (same >= 0) {
      claimed.add(same)
      continue
    }
    place(anchor, textOf(mine, block))
  }

  const items: Item[] = (added.get('start') ?? []).map((text) => ({ kind: 'new', text }))
  for (const [index, text] of out.entries()) {
    if (text !== null) items.push({ kind: 'theirs', index, text })
    for (const extra of added.get(index) ?? []) items.push({ kind: 'new', text: extra })
  }
  return assemble(theirs, items, top)
}

type PhaseParts = { node: MdxJsxFlowElement; tagEnd: number; closeStart: number; inner: Region }

/** A phase cut into its opening tag, the run of blocks inside, and its closing tag. */
function phaseParts(text: string, block: Block): PhaseParts | undefined {
  const node = block.node
  if (!isFlowJsx(node) || node.name !== 'phase') return undefined
  const lastAttribute = node.attributes.at(-1)
  const afterName = lastAttribute ? lastAttribute.position?.end.offset : block.start + 1 + node.name.length
  if (afterName === undefined) return undefined
  const close = text.indexOf('>', afterName)
  if (close < 0 || text.slice(afterName, close).trim() !== '') return undefined
  const tagEnd = close + 1
  const closing = /<\/\s*phase\s*>$/.exec(text.slice(block.start, block.end))
  if (!closing) return undefined
  const closeStart = block.start + closing.index
  const blocks = toBlocks(node.children)
  // A block inside is edited on its own only when it starts a line (src/planMdx/remarkBlockRanges.ts).
  if (blocks.some((child) => child.node.position?.start.column !== 1 || child.start < tagEnd || child.end > closeStart)) return undefined
  return { node, tagEnd, closeStart, inner: { text, blocks, from: tagEnd, to: closeStart } }
}

type AttributeText = { name: string; text: string; key: string; start: number; end: number }

function attributesOf(text: string, node: MdxJsxFlowElement): Map<string, AttributeText> | undefined {
  const out = new Map<string, AttributeText>()
  for (const attribute of node.attributes as Array<MdxJsxAttribute | MdxJsxExpressionAttribute>) {
    const start = attribute.position?.start.offset
    const end = attribute.position?.end.offset
    if (start === undefined || end === undefined) return undefined
    const slice = text.slice(start, end)
    const name = attribute.type === 'mdxJsxAttribute' ? attribute.name : `{${slice}}`
    out.set(name, { name, text: slice, key: keyOf(attribute), start, end })
  }
  return out
}

/** A phase both sides changed: its attributes one by one, then its blocks one by one. */
function mergePhase(
  context: Context,
  base: Region,
  baseBlock: Block,
  mine: Region,
  mineBlock: Block,
  theirs: Region,
  theirsBlock: Block,
  path: string,
): string | undefined {
  const b = phaseParts(base.text, baseBlock)
  const m = phaseParts(mine.text, mineBlock)
  const t = phaseParts(theirs.text, theirsBlock)
  if (!b || !m || !t) return undefined
  const tag = mergeTag(context, theirs.text, theirsBlock, { base: [base.text, b], mine: [mine.text, m], theirs: [theirs.text, t] }, path)
  if (tag === undefined) return undefined
  const title = attr(t.node, 'title') ?? attr(m.node, 'title') ?? attr(t.node, 'id')
  const inner = mergeRegion(context, b.inner, m.inner, t.inner, path, title, false)
  return `${tag}${inner}${theirs.text.slice(t.closeStart, theirsBlock.end)}`
}

/** The phase's opening tag: theirs, with the attributes only the person changed taken from theirs'. */
function mergeTag(
  context: Context,
  text: string,
  theirsBlock: Block,
  sides: Record<'base' | 'mine' | 'theirs', [string, PhaseParts]>,
  path: string,
): string | undefined {
  const [baseText, b] = sides.base
  const [mineText, m] = sides.mine
  const [, t] = sides.theirs
  const baseAttrs = attributesOf(baseText, b.node)
  const mineAttrs = attributesOf(mineText, m.node)
  const theirsAttrs = attributesOf(text, t.node)
  if (!baseAttrs || !mineAttrs || !theirsAttrs) return undefined
  const names = [...theirsAttrs.keys(), ...[...mineAttrs.keys()].filter((name) => !theirsAttrs.has(name))]
  const fromMine: string[] = []
  const clashing: string[] = []
  for (const name of names) {
    const was = baseAttrs.get(name)?.key
    const mineKey = mineAttrs.get(name)?.key
    const theirsKey = theirsAttrs.get(name)?.key
    if (mineKey === was || mineKey === theirsKey) continue
    if (theirsKey === was) fromMine.push(name)
    else clashing.push(name)
  }
  const tagText = (source: string, parts: PhaseParts, block: Block) => source.slice(block.start, parts.tagEnd)
  const theirsTag = tagText(text, t, theirsBlock)
  if (clashing.length > 0) {
    const title = attr(t.node, 'title') ?? attr(m.node, 'title') ?? attr(t.node, 'id') ?? 'Phase'
    const mineBlockStart = m.node.position?.start.offset ?? 0
    const side = conflict(context, {
      key: `${path}tag`,
      label: `${short(title, 50)} (${clashing.join(', ')})`,
      mine: mineText.slice(mineBlockStart, m.tagEnd),
      theirs: theirsTag,
      minePreview: clashing.map((name) => mineAttrs.get(name)?.text ?? `no ${name}`).join(' '),
    })
    if (side === 'mine') fromMine.push(...clashing)
  }
  if (fromMine.length === 0) return theirsTag

  // Edit theirs' tag in place, from the end, so earlier offsets hold.
  const start = theirsBlock.start
  const lastTheirs = [...theirsAttrs.values()].at(-1)
  const insertAt = (lastTheirs ? lastTheirs.end : start + 1 + 'phase'.length) - start
  const edits: Array<{ at: number; length: number; text: string }> = []
  for (const name of fromMine) {
    const ours = mineAttrs.get(name)
    const current = theirsAttrs.get(name)
    if (current && ours) edits.push({ at: current.start - start, length: current.end - current.start, text: ours.text })
    else if (current) {
      const lead = /\s*$/.exec(theirsTag.slice(0, current.start - start))?.[0].length ?? 0
      edits.push({ at: current.start - start - lead, length: current.end - current.start + lead, text: '' })
    } else if (ours) edits.push({ at: insertAt, length: 0, text: ` ${ours.text}` })
  }
  let tag = theirsTag
  for (const edit of edits.sort((x, y) => y.at - x.at)) tag = tag.slice(0, edit.at) + edit.text + tag.slice(edit.at + edit.length)
  return tag
}

type WorkflowLines = { shell: string; nodes: string[]; edges: string[] }

function workflowLines(node: RootContent): WorkflowLines | undefined {
  if (!isFlowJsx(node) || node.name !== 'workflow') return undefined
  const fence = node.children.find((child): child is Code => child.type === 'code' && child.lang === 'workflow')
  if (!fence) return undefined
  const shell = keyOf({ ...node, children: node.children.map((child) => (child === fence ? { ...fence, value: '' } : child)) })
  const lines = fence.value.split('\n')
  const cut = lines.findIndex((line) => line.trim() === '--')
  const head = cut < 0 ? lines : lines.slice(0, cut)
  const tail = cut < 0 ? [] : lines.slice(cut + 1)
  return {
    shell,
    nodes: head.map((line) => line.trim()).filter(Boolean),
    edges: tail.map((line) => line.trim()).filter(Boolean),
  }
}

function edgeEnds(line: string): [string, string] | undefined {
  const match = /^(\S+)\s*->\s*(\S+)/.exec(line)
  return match ? [match[1]!, match[2]!] : undefined
}

/**
 * True when the person's workflow differs from base only by the steps `wireNewSteps` wrote for
 * cards they added: those steps' lines, their edges, and the base edges they were put between.
 */
function wiringOnly(base: Block, mine: Block, newIds: Set<string>): boolean {
  if (newIds.size === 0) return false
  const was = workflowLines(base.node)
  const now = workflowLines(mine.node)
  if (!was || !now || was.shell !== now.shell) return false
  const isNew = (line: string) => newIds.has(workflowNodeCells(line)?.[0] ?? '')
  if (now.nodes.filter((line) => !isNew(line)).join('\n') !== was.nodes.join('\n')) return false
  // A step `wireNewSteps` wrote is `id | label | id`. Anything else on a new step was typed by hand.
  const written = (line: string) => {
    const [id, , ref, ...rest] = workflowNodeCells(line) ?? []
    return id === ref && rest.length === 0
  }
  if (!now.nodes.filter(isNew).every(written)) return false
  const touchesNew = (line: string) => {
    const ends = edgeEnds(line)
    return ends ? newIds.has(ends[0]) || newIds.has(ends[1]) : false
  }
  if (now.edges.some((line) => touchesNew(line) && !/^\S+\s*->\s*\S+$/.test(line))) return false
  const left = [...was.edges]
  for (const line of now.edges.filter((edge) => !touchesNew(edge))) {
    const at = left.indexOf(line)
    if (at < 0) return false
    left.splice(at, 1)
  }
  // Each base edge that is gone now runs through the new steps.
  const next = new Map<string, string[]>()
  for (const line of now.edges) {
    const ends = edgeEnds(line)
    if (ends) next.set(ends[0], [...(next.get(ends[0]) ?? []), ends[1]])
  }
  return left.every((line) => {
    const ends = edgeEnds(line)
    if (!ends) return false
    const [from, to] = ends
    const queue = (next.get(from) ?? []).filter((step) => newIds.has(step))
    const seen = new Set(queue)
    while (queue.length > 0) {
      const step = queue.shift()!
      for (const after of next.get(step) ?? []) {
        if (after === to) return true
        if (newIds.has(after) && !seen.has(after)) {
          seen.add(after)
          queue.push(after)
        }
      }
    }
    return false
  })
}

function bodyRegion(body: string): Region {
  return { text: body, blocks: toBlocks(parse(body).children), from: 0, to: body.length }
}

/**
 * The person's edits (`mine` against `base`) on top of the agent's plan (`theirs`).
 *
 * - A block the person did not change takes theirs.
 * - A block the person changed that the agent did not change takes the person's.
 * - A block the person added goes after the block before it, in theirs; when the agent removed that
 *   one, after the nearest block before it that theirs still has, or first when there is none.
 * - A block the person removed that the agent did not change is removed.
 * - A block both changed, each in its own way, is a conflict: the source keeps theirs and the
 *   conflict carries both texts, until `keep` picks a side. The same change on both sides is no conflict.
 * - A phase both changed merges its attributes one by one and the blocks inside it one by one.
 * - Front matter takes theirs unless only the person changed it.
 * - When the person's workflow differs only by the steps for their new cards, the agent's
 *   workflow is kept and those cards are wired onto it again (`wireNewSteps`).
 *
 * Throws when a version does not parse as MDX.
 */
export function rebaseDraft(input: RebaseInput): RebaseResult {
  const { base, mine, theirs } = input
  if (mine === base || mine === theirs) return { source: theirs, conflicts: [] }
  if (theirs === base) return { source: mine, conflicts: [] }

  const b = splitFrontmatter(base)
  const m = splitFrontmatter(mine)
  const t = splitFrontmatter(theirs)
  const frontmatter = m.frontmatter !== b.frontmatter && t.frontmatter === b.frontmatter ? m.frontmatter : t.frontmatter

  const baseIds = topEntryIds(b.body)
  const theirsIds = topEntryIds(t.body)
  const context: Context = {
    keep: input.keep ?? {},
    conflicts: [],
    newIds: new Set([...topEntryIds(m.body)].filter((id) => !baseIds.has(id))),
    rewire: false,
  }
  let body = mergeRegion(context, bodyRegion(b.body), bodyRegion(m.body), bodyRegion(t.body), '', undefined, true)
  if (context.rewire) body = wireNewSteps(body, new Set([...baseIds, ...theirsIds]))
  if (frontmatter && !frontmatter.endsWith('\n') && body && !body.startsWith('\n')) body = `\n${body}`
  return { source: `${frontmatter}${body}`, conflicts: context.conflicts }
}
