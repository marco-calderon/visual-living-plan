import { addComposerChild$, addNestedEditorChild$, realmPlugin } from '@mdxeditor/editor'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelection, $isParagraphNode, $isRangeSelection, $isRootOrShadowRoot, BLUR_COMMAND, COMMAND_PRIORITY_LOW, FOCUS_COMMAND } from 'lexical'
import { useEffect } from 'react'

/** The attribute on the empty line with the caret. planEditor.css draws the hint from it. */
export const SLASH_HINT_ATTR = 'data-slash-hint'

/**
 * "Type / to add a block" on the empty line that holds the caret, in the plan and in each card's
 * body. Only the line being typed on shows it: other empty lines and the + bars stay blank.
 */
function SlashHint() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    let marked: HTMLElement | null = null
    const clear = () => {
      marked?.removeAttribute(SLASH_HINT_ATTR)
      marked = null
    }
    const update = () => {
      const key = editor.getEditorState().read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null
        const node = selection.anchor.getNode()
        const line = $isParagraphNode(node) ? node : node.getParent()
        if (!$isParagraphNode(line) || line.getChildrenSize() > 0) return null
        return $isRootOrShadowRoot(line.getParent()) ? line.getKey() : null
      })
      const root = editor.getRootElement()
      const active = document.activeElement
      const focused = root !== null && active !== null && (root === active || root.contains(active))
      const element = key && focused ? editor.getElementByKey(key) : null
      if (element === marked) return
      clear()
      if (!element) return
      element.setAttribute(SLASH_HINT_ATTR, '')
      marked = element
    }
    const stopUpdate = editor.registerUpdateListener(update)
    const stopFocus = editor.registerCommand(
      FOCUS_COMMAND,
      () => {
        requestAnimationFrame(update)
        return false
      },
      COMMAND_PRIORITY_LOW,
    )
    const stopBlur = editor.registerCommand(
      BLUR_COMMAND,
      () => {
        clear()
        return false
      },
      COMMAND_PRIORITY_LOW,
    )
    return () => {
      stopUpdate()
      stopFocus()
      stopBlur()
      clear()
    }
  }, [editor])
  return null
}

export const slashHintPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addComposerChild$]: SlashHint,
      [addNestedEditorChild$]: SlashHint,
    })
  },
})
