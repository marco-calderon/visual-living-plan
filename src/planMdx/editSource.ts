import { fromMarkdown } from 'mdast-util-from-markdown'
import { mdxFromMarkdown } from 'mdast-util-mdx'
import { mdxjs } from 'micromark-extension-mdxjs'
import type { Code, Root, RootContent } from 'mdast'
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx'

/**
 * Helpers for editing a plan on the page.
 *
 * The editor rewrites the whole document when it saves (indentation, blank lines). To keep the
 * agent's file readable, a save keeps every top-level block the person did not change as it is in
 * the file, and only writes the blocks that changed.
 */

type JsxElement = MdxJsxFlowElement | MdxJsxTextElement

/** Plan tags that are also HTML tags. The editor would treat them as HTML, so they get another name while editing. */
export const EDITOR_TAG_NAMES: Record<string, string> = {
  form: 'plan-form',
  option: 'plan-option',
}

const FILE_TAG_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(EDITOR_TAG_NAMES).map(([file, editor]) => [editor, file]),
)

/** Plan cards that become a step on the workflow when they are added on the page. */
const STEP_TAGS = new Set(['phase', 'choice', 'form', 'questions', 'approve'])

function parse(markdown: string): Root {
  return fromMarkdown(markdown, { extensions: [mdxjs()], mdastExtensions: [mdxFromMarkdown()] })
}

function isJsx(node: { type: string }): node is JsxElement {
  return node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement'
}

function walk(node: Root | RootContent, fn: (node: RootContent) => void): void {
  if (node.type !== 'root') fn(node)
  if ('children' in node) for (const child of node.children) walk(child as RootContent, fn)
}

/** Split a plan file into its front matter (kept as written) and its MDX body. */
export function splitFrontmatter(source: string): { frontmatter: string; body: string } {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(source)
  if (!match) return { frontmatter: '', body: source }
  return { frontmatter: match[0], body: source.slice(match[0].length) }
}

export function joinFrontmatter(frontmatter: string, body: string): string {
  const text = `${body.trim()}\n`
  if (!frontmatter) return text
  return `${frontmatter.endsWith('\n') ? frontmatter : `${frontmatter}\n`}${text}`
}

/** Rename JSX tags by name, leaving code fences and prose alone. */
export function renameTags(markdown: string, names: Record<string, string>): string {
  const edits: Array<{ at: number; length: number; text: string }> = []
  walk(parse(markdown), (node) => {
    if (!isJsx(node) || !node.name || !(node.name in names)) return
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start === undefined || end === undefined) return
    const next = names[node.name] ?? node.name
    const open = markdown.indexOf(node.name, start)
    if (open < 0 || open > end) return
    edits.push({ at: open, length: node.name.length, text: next })
    const tail = markdown.slice(start, end)
    const closing = new RegExp(`</\\s*${node.name.replace(/[-]/g, '\\-')}\\s*>$`).exec(tail)
    if (closing) {
      const nameAt = start + closing.index + closing[0].indexOf(node.name)
      edits.push({ at: nameAt, length: node.name.length, text: next })
    }
  })
  let out = markdown
  for (const edit of edits.sort((a, b) => b.at - a.at)) {
    out = out.slice(0, edit.at) + edit.text + out.slice(edit.at + edit.length)
  }
  return out
}

/** The body as the editor should load it. */
export function toEditorMarkdown(body: string): string {
  return renameTags(body, EDITOR_TAG_NAMES)
}

/** Editor output with the plan's own tag names back. */
export function fromEditorMarkdown(markdown: string): string {
  return renameTags(markdown, FILE_TAG_NAMES)
}

type Block = { start: number; end: number; key: string; node: RootContent }

/** A block's meaning without its spacing: the syntax tree with positions dropped. */
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

function topBlocks(markdown: string): Block[] {
  return parse(markdown).children.flatMap((node) => {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (start === undefined || end === undefined) return []
    return [{ start, end, key: JSON.stringify(canonical(node)), node }]
  })
}

/**
 * The editor indents everything inside a tag by two spaces per level. Plan files are written
 * flat, so a changed block drops that indentation again. Code inside keeps its own.
 */
export function flattenJsxIndent(text: string): string {
  const spans: Array<{ from: number; to: number }> = []
  const code: Array<{ from: number; to: number }> = []
  walk(parse(text), (node) => {
    if (node.type === 'code' && node.position) code.push({ from: node.position.start.line, to: node.position.end.line })
    if (node.type !== 'mdxJsxFlowElement' || !node.position) return
    if (node.position.end.line - node.position.start.line < 2) return
    spans.push({ from: node.position.start.line, to: node.position.end.line })
  })
  if (spans.length === 0) return text
  const lines = text.split('\n')
  const inCode = (number: number) => code.some((span) => span.from <= number && number <= span.to)
  // The editor leaves empty paragraphs behind. Drop blank lines before a closing tag, and keep one blank line between blocks.
  const drop = new Set<number>()
  for (const span of spans) {
    for (let number = span.to - 1; number > span.from && !lines[number - 1]?.trim(); number--) drop.add(number)
  }
  for (let number = 2; number <= lines.length; number++) {
    if (!lines[number - 1]?.trim() && !lines[number - 2]?.trim() && !inCode(number)) drop.add(number)
  }
  return lines
    .flatMap((line, index) => {
      const number = index + 1
      if (drop.has(number)) return []
      const depth = spans.filter((span) => span.from < number && number < span.to).length
      let cut = 0
      while (cut < depth * 2 && line[cut] === ' ') cut += 1
      return [line.slice(cut)]
    })
    .join('\n')
}

/**
 * Put the edited document back together from the original file.
 *
 * A block of the editor's output that means the same as a block of the file (the same syntax
 * tree, whatever the spacing) was not touched, and is copied from the file as written. Changed
 * and new blocks use the editor's text, without its extra indentation.
 */
export function mergeEditedBody(original: string, edited: string): string {
  const base = topBlocks(original)
  const next = topBlocks(edited)

  // Longest run of unchanged blocks, in order.
  const rows = base.length
  const cols = next.length
  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0))
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i]![j] =
        base[i]!.key === next[j]!.key ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
    }
  }
  const pieces: Array<{ kept: number } | { moved: number } | { text: string }> = []
  let i = 0
  let j = 0
  while (j < cols) {
    if (i < rows && base[i]!.key === next[j]!.key) {
      pieces.push({ kept: i })
      i += 1
      j += 1
    } else if (i < rows && table[i + 1]![j]! >= table[i]![j + 1]!) {
      i += 1
    } else {
      pieces.push({ text: flattenJsxIndent(edited.slice(next[j]!.start, next[j]!.end)) })
      j += 1
    }
  }

  // A block that only moved is outside the run above but unchanged: it keeps the file text too.
  const kept = new Set(pieces.flatMap((piece) => ('kept' in piece ? [piece.kept] : [])))
  const unused = new Map<string, number[]>()
  base.forEach((block, index) => {
    if (kept.has(index)) return
    unused.set(block.key, [...(unused.get(block.key) ?? []), index])
  })
  let at = 0
  for (const [index, piece] of pieces.entries()) {
    if ('kept' in piece) {
      at += 1
      continue
    }
    const key = next[at]!.key
    at += 1
    const match = unused.get(key)?.shift()
    if (match !== undefined) pieces[index] = { moved: match }
  }

  let out = ''
  let previous: number | null = null
  for (const piece of pieces) {
    if ('kept' in piece) {
      const block = base[piece.kept]!
      if (previous !== null && piece.kept === previous + 1) {
        out += original.slice(base[previous]!.end, block.start)
      } else if (out) {
        out += '\n\n'
      }
      out += original.slice(block.start, block.end)
      previous = piece.kept
    } else if ('moved' in piece) {
      const block = base[piece.moved]!
      if (out) out += '\n\n'
      out += original.slice(block.start, block.end)
      previous = null
    } else {
      if (out) out += '\n\n'
      out += piece.text
      previous = null
    }
  }
  return `${out.trim()}\n`
}

function attr(node: JsxElement, name: string): string | undefined {
  for (const attribute of node.attributes) {
    if (attribute.type === 'mdxJsxAttribute' && attribute.name === name && typeof attribute.value === 'string') {
      return attribute.value
    }
  }
  return undefined
}

/** Ids of the top-level cards in a plan body. */
export function topEntryIds(body: string): Set<string> {
  const ids = new Set<string>()
  for (const node of parse(body).children) {
    if (!isJsx(node)) continue
    const id = attr(node, 'id')
    if (id) ids.add(id)
  }
  return ids
}

type WorkflowLines = { nodes: string[]; edges: string[] }

function splitWorkflow(value: string): WorkflowLines {
  const lines = value.split('\n')
  const cut = lines.findIndex((line) => line.trim() === '--')
  const head = cut < 0 ? lines : lines.slice(0, cut)
  const tail = cut < 0 ? [] : lines.slice(cut + 1)
  return { nodes: head.filter((line) => line.trim()), edges: tail.filter((line) => line.trim()) }
}

function nodeRef(line: string): string {
  const [id = '', , ref] = line.split('|').map((part) => part.trim())
  return ref || id
}

function nodeId(line: string): string {
  return (line.split('|')[0] ?? '').trim()
}

/**
 * Add each new top-level card (a phase or a question for the person) to the workflow, between
 * the steps before and after it in the document. `known` is the set of card ids from before the edit.
 */
export function wireNewSteps(body: string, known: Set<string>): string {
  const tree = parse(body)
  const workflow = tree.children.find((node): node is MdxJsxFlowElement => isJsx(node) && node.name === 'workflow')
  const fence = workflow?.children.find((node): node is Code => node.type === 'code' && node.lang === 'workflow')
  const start = fence?.position?.start.offset
  const end = fence?.position?.end.offset
  if (!fence || start === undefined || end === undefined) return body

  const lines = splitWorkflow(fence.value)
  const refs = () => new Map(lines.nodes.map((line) => [nodeRef(line), nodeId(line)]))
  const entries = tree.children.flatMap((node) => {
    if (!isJsx(node) || !node.name || node.name === 'workflow') return []
    const id = attr(node, 'id')
    if (!id) return []
    const label = attr(node, 'title') ?? attr(node, 'prompt') ?? id
    return [{ id, label, step: STEP_TAGS.has(node.name) }]
  })
  let changed = false
  for (const [index, entry] of entries.entries()) {
    const placed = refs()
    if (!entry.step || known.has(entry.id) || placed.has(entry.id)) continue
    const prev = entries.slice(0, index).reverse().find((other) => placed.has(other.id))
    const next = entries.slice(index + 1).find((other) => placed.has(other.id))
    const prevNode = prev ? placed.get(prev.id) : undefined
    const nextNode = next ? placed.get(next.id) : undefined
    const line = `${entry.id} | ${entry.label.replace(/\|/g, '/')} | ${entry.id}`
    const after = prevNode ? lines.nodes.findIndex((node) => nodeId(node) === prevNode) : -1
    if (after >= 0) lines.nodes.splice(after + 1, 0, line)
    else lines.nodes.unshift(line)
    const direct = lines.edges.findIndex((edge) => {
      const match = /^(\S+)\s*->\s*(\S+)/.exec(edge.trim())
      return match?.[1] === prevNode && match?.[2] === nextNode
    })
    const added = [prevNode ? `${prevNode} -> ${entry.id}` : null, nextNode ? `${entry.id} -> ${nextNode}` : null].filter(
      (edge): edge is string => Boolean(edge),
    )
    if (direct >= 0 && prevNode && nextNode) lines.edges.splice(direct, 1, ...added)
    else lines.edges.push(...added)
    changed = true
  }
  if (!changed) return body
  const original = body.slice(start, end)
  const open = original.slice(0, original.indexOf('\n'))
  const close = original.slice(original.lastIndexOf('\n') + 1)
  const value = [...lines.nodes, '--', ...lines.edges].join('\n')
  return `${body.slice(0, start)}${open}\n${value}\n${close}${body.slice(end)}`
}

/** A full plan file from the edited editor output. */
export function planSourceFromEditor(input: { source: string; edited: string }): string {
  const { frontmatter, body } = splitFrontmatter(input.source)
  const merged = mergeEditedBody(body, fromEditorMarkdown(input.edited))
  return joinFrontmatter(frontmatter, wireNewSteps(merged, topEntryIds(body)))
}
