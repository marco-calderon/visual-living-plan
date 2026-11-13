import { fromEditorMarkdown, mergeEditedBody, splitFrontmatter, toEditorMarkdown, topEntryIds, wireNewSteps } from './editSource'
import { blockText, insertBlockAfter, spliceBlock } from './remarkBlockRanges'

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
