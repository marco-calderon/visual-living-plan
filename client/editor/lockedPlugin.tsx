import { addComposerChild$, addNestedEditorChild$, realmPlugin } from '@mdxeditor/editor'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CUT_COMMAND,
  DELETE_CHARACTER_COMMAND,
  DROP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  PASTE_COMMAND,
  REMOVE_TEXT_COMMAND,
  type LexicalCommand,
  type LexicalNode,
} from 'lexical'
import { useContext, useEffect } from 'react'
import { isLockedNode, LockedContext } from './locked.ts'

/** Whether the selection covers a locked card, so typing, deleting, or pasting over it would remove it. */
function $selectionHasLocked(): boolean {
  const selection = $getSelection()
  if ($isNodeSelection(selection)) return selection.getNodes().some(isLockedNode)
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return false
  return selection.getNodes().some(isLockedNode)
}

/** Whether the caret is at the very start (or end) of its line. */
function $atLineEdge(backward: boolean): LexicalNode | null {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null
  const { anchor } = selection
  const node = anchor.getNode()
  const line = node.getTopLevelElement()
  if (!line) return null
  if (backward) {
    const first = line.getFirstDescendant() ?? line
    return anchor.offset === 0 && (node.is(line) || node.is(first)) ? line : null
  }
  const last = line.getLastDescendant() ?? line
  const end = node.is(line) ? line.getChildrenSize() : node.getTextContentSize()
  return anchor.offset === end && (node.is(line) || node.is(last)) ? line : null
}

/**
 * The caret sits right next to a locked card, so Backspace (after it) or Delete (before it) would
 * take the card. An empty line goes instead, which is what the person meant; otherwise nothing happens.
 */
function $caretAgainstLocked(backward: boolean): boolean {
  const line = $atLineEdge(backward)
  const card = backward ? line?.getPreviousSibling() : line?.getNextSibling()
  if (!line || !isLockedNode(card)) return false
  if (line.getTextContent() === '' && $isElementNode(line)) {
    const before = line.getPreviousSibling()
    const after = line.getNextSibling()
    line.remove()
    if (backward) {
      if ($isElementNode(after)) after.selectStart()
      else $setSelection(null)
    } else if ($isElementNode(before)) before.selectEnd()
    else $setSelection(null)
  }
  return true
}

/** In the plan's editor: nothing typed, deleted, cut, pasted, or dropped removes a locked card. */
function LockedCardsGuard() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    const block = (event?: Event | null) => {
      event?.preventDefault?.()
      return true
    }
    const guard = <T,>(command: LexicalCommand<T>, check: (payload: T) => boolean) =>
      editor.registerCommand(command, (payload) => (check(payload) ? block(payload as Event | null) : false), COMMAND_PRIORITY_CRITICAL)
    const stops = [
      guard(KEY_BACKSPACE_COMMAND, () => $selectionHasLocked() || $caretAgainstLocked(true)),
      guard(KEY_DELETE_COMMAND, () => $selectionHasLocked() || $caretAgainstLocked(false)),
      // Phone keyboards delete through this command, not the key commands.
      guard(DELETE_CHARACTER_COMMAND, (backward) => $selectionHasLocked() || $caretAgainstLocked(backward)),
      guard(REMOVE_TEXT_COMMAND, () => $selectionHasLocked()),
      guard(CUT_COMMAND, () => $selectionHasLocked()),
      guard(PASTE_COMMAND, () => $selectionHasLocked()),
      guard(DROP_COMMAND, () => $selectionHasLocked()),
      guard(CONTROLLED_TEXT_INSERTION_COMMAND, () => $selectionHasLocked()),
    ]
    return () => {
      for (const stop of stops) stop()
    }
  }, [editor])
  return null
}

/** In a card's body: a locked card's body (and every row in it) is read-only. */
function LockedBodyEditor() {
  const [editor] = useLexicalComposerContext()
  const locked = useContext(LockedContext)
  useEffect(() => {
    if (editor.isEditable() === !locked) return
    editor.setEditable(!locked)
  }, [editor, locked])
  return null
}

/** A card's body can hold a locked card too, and is itself locked inside one. */
function NestedLock() {
  return (
    <>
      <LockedCardsGuard />
      <LockedBodyEditor />
    </>
  )
}

/** Locks the cards in LOCKED_ENTRY_TAGS: see locked.ts. */
export const lockedCardsPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addComposerChild$]: LockedCardsGuard,
      [addNestedEditorChild$]: NestedLock,
    })
  },
})
