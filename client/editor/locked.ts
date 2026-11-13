import { createContext } from 'react'
import { EDITOR_TAG_NAMES } from '../../src/planMdx/editSource.ts'

/**
 * Plan tags the page editor shows but does not let a person change unless they set
 * `locked="false"`, by their name in the plan file. Any other tag is locked by `locked` (ADR 0039). The agent writes these cards for the person to answer on the page, so their title, prompt,
 * id, icon, body, and rows (a form's fields, the questions' items) stay as the agent wrote them,
 * and the card cannot be deleted. It can still be moved. Add a tag here to lock another card.
 */
export const LOCKED_ENTRY_TAGS: readonly string[] = ['form', 'questions']

const LOCKED = new Set(LOCKED_ENTRY_TAGS.flatMap((tag) => [tag, EDITOR_TAG_NAMES[tag] ?? tag]))

/** Whether a tag, by its file name or its editing name (`form` or `plan-form`), is locked. */
export function isLockedTag(tag: string | null | undefined): boolean {
  return Boolean(tag && LOCKED.has(tag))
}

type MdastLike = {
  name?: string | null
  attributes?: ReadonlyArray<{ type?: string; name?: string; value?: unknown }>
} | null | undefined

/** A JSX node's `locked` attribute: `true` for bare `locked`, `"true"`, or `{true}`; `false` for `"false"`. */
export function lockedAttribute(node: MdastLike): boolean | undefined {
  const attribute = node?.attributes?.find((item) => item.type === 'mdxJsxAttribute' && item.name === 'locked')
  if (!attribute) return undefined
  const value = attribute.value
  if (value === null || value === undefined || value === '' || value === 'true') return true
  if (value === 'false') return false
  if (typeof value === 'object' && value !== null && 'value' in value) {
    const expression = String((value as { value?: unknown }).value).trim()
    if (expression === 'true') return true
    if (expression === 'false') return false
  }
  return undefined
}

/**
 * Whether a plan tag is locked (ADR 0039): any card with `locked`, and the answer cards in
 * LOCKED_ENTRY_TAGS unless they set `locked="false"`.
 */
export function isLockedMdast(node: MdastLike): boolean {
  return lockedAttribute(node) ?? isLockedTag(node?.name)
}

/** Whether a node of the editor is a locked card: see isLockedMdast. */
export function isLockedNode(node: unknown): boolean {
  if (!node || typeof node !== 'object' || !('getMdastNode' in node)) return false
  const getMdastNode = (node as { getMdastNode?: () => MdastLike }).getMdastNode
  return typeof getMdastNode === 'function' && isLockedMdast(getMdastNode.call(node))
}

/** True inside a locked card, so its rows and its body editor are locked with it. */
export const LockedContext = createContext(false)
