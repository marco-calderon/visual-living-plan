import { createContext } from 'react'
import { EDITOR_TAG_NAMES } from '../../src/planMdx/editSource.ts'

/**
 * Plan tags the page editor shows but does not let a person change, by their name in the plan
 * file. The agent writes these cards for the person to answer on the page, so their title, prompt,
 * id, icon, body, and rows (a form's fields, the questions' items) stay as the agent wrote them,
 * and the card cannot be deleted. It can still be moved. Add a tag here to lock another card.
 */
export const LOCKED_ENTRY_TAGS: readonly string[] = ['form', 'questions']

const LOCKED = new Set(LOCKED_ENTRY_TAGS.flatMap((tag) => [tag, EDITOR_TAG_NAMES[tag] ?? tag]))

/** Whether a tag, by its file name or its editing name (`form` or `plan-form`), is locked. */
export function isLockedTag(tag: string | null | undefined): boolean {
  return Boolean(tag && LOCKED.has(tag))
}

/** Whether a node of the editor is a locked card: a JSX node whose tag is in LOCKED_ENTRY_TAGS. */
export function isLockedNode(node: unknown): boolean {
  if (!node || typeof node !== 'object' || !('getMdastNode' in node)) return false
  const getMdastNode = (node as { getMdastNode?: () => { name?: string | null } | null }).getMdastNode
  return typeof getMdastNode === 'function' && isLockedTag(getMdastNode.call(node)?.name)
}

/** True inside a locked card, so its rows and its body editor are locked with it. */
export const LockedContext = createContext(false)
