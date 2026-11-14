import { fromEditorMarkdown, mergeEditedBody, splitFrontmatter, toEditorMarkdown, topEntryIds, wireNewSteps } from './editSource'
import { blockText, insertBlockAfter, mdxBodyOffset, spliceBlock } from './remarkBlockRanges'

/**
 * Editing one block of a plan on the page (ADR 0040). The page renders the plan, and a block's
 * Edit opens an editor for that block alone. Its result goes back into the file at the block's
 * place; every other block stays as the file has it.
 */

export type BlockRange = { start: number; end: number }

export type BlockEdit =
  /** The block at `range` becomes the editor's text. Empty text removes it. */
  | { kind: 'replace'; range: BlockRange; edited: string }
  /** The editor's text goes after the block at `range`, or at the end of the plan when `range` is null. */
  | { kind: 'insert'; after: BlockRange | null; edited: string }

/** The editor's text for one block of the plan file. */
export function blockEditorText(source: string, range: BlockRange): string {
  return toEditorMarkdown(blockText(source, range))
}

/**
 * The plan file after one block edit. Blocks of the edit that mean the same as the original are
 * kept as written, and a phase, choice, form, questions, or approval that is new gets a step on
 * the workflow, as a whole-page edit did (src/planMdx/editSource.ts).
 */
export function applyBlockEdit(source: string, edit: BlockEdit): string {
  const known = topEntryIds(splitFrontmatter(source).body)
  const text = fromEditorMarkdown(edit.edited)
  let next: string
  if (edit.kind === 'replace') {
    const original = blockText(source, edit.range)
    next = spliceBlock(source, edit.range, text.trim() ? mergeEditedBody(original, text) : '')
  } else {
    next = text.trim() ? insertBlockAfter(source, edit.after, mergeEditedBody('', text)) : source
  }
  // Everything else in the file stays byte for byte, front matter and spacing included.
  const split = splitFrontmatter(next)
  const wired = wireNewSteps(split.body, known)
  return wired === split.body ? next : `${split.frontmatter}${wired}`
}

/** True when two plan files differ only in the spacing at their ends. */
export function samePlanSource(a: string, b: string): boolean {
  return a.trimEnd() === b.trimEnd()
}

/** A pipe table cell's text in the plan file, for the editor that opens on that cell alone. */
export function cellEditorText(source: string, range: BlockRange): string {
  const offset = mdxBodyOffset(source)
  return source.slice(offset + range.start, offset + range.end)
}

/**
 * The editor's text as one pipe table cell: one line, with its pipes escaped so the row keeps its
 * cells. Paragraphs and line breaks the editor wrote join with a space.
 */
export function cellMarkdown(edited: string): string {
  return fromEditorMarkdown(edited)
    .replace(/\\\n|\s*\n\s*/g, ' ')
    // A space the writer kept at a line's end as `&#x20;` is an ordinary space once the lines join.
    .replace(/&#x20;/g, ' ')
    .replace(/\\.|\|/g, (token) => (token === '|' ? '\\|' : token))
    .trim()
}

/** The plan file with one pipe table cell's text replaced. Every other byte stays, the row's pipes and spacing included. */
export function applyCellEdit(source: string, range: BlockRange, edited: string): string {
  const offset = mdxBodyOffset(source)
  const text = cellMarkdown(edited)
  const start = offset + range.start
  const end = offset + range.end
  const before = source.slice(0, start)
  const after = source.slice(end)
  // An empty cell's place can be right against its closing pipe: new text keeps a space before it.
  const pad = range.start === range.end && text && !after.startsWith(' ') ? ' ' : ''
  return `${before}${text}${pad}${after}`
}
