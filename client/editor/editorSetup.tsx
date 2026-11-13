import {
  codeBlockPlugin,
  defaultSvgIcons,
  headingsPlugin,
  imagePlugin,
  jsxPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  type IconKey,
} from '@mdxeditor/editor'
import { Plus } from 'lucide-react'
import { useEffect, type ReactElement, type RefObject } from 'react'
import { planJsxDescriptors } from './entryEditors.tsx'
import { slashMenuPlugin } from './slashMenu.tsx'
import { slashHintPlugin } from './slashHint.tsx'
import { lockedCardsPlugin } from './lockedPlugin.tsx'
import { codeFenceEditor } from './codeFence.tsx'
import { blockHandlesPlugin } from './blockHandles.tsx'
import { dataTableMarkdownPlugin } from './dataTableEditor.tsx'

/** A table's add-row and add-column bars use the same + as the bar that adds a block. */
export function iconFor(name: IconKey): ReactElement {
  if (name === 'add_row' || name === 'add_column') return <Plus size={12} strokeWidth={2.25} aria-hidden="true" />
  return defaultSvgIcons[name]
}

/** Everything a plan's editor can do: prose, tables, code, plan cards, the `/` menu, locks, and block handles. */
export function planEditorPlugins() {
  return [
    headingsPlugin(),
    listsPlugin(),
    quotePlugin(),
    thematicBreakPlugin(),
    linkPlugin(),
    // Images from an address, added with Image in the card menu. Sized by the page, not by dragging.
    imagePlugin({ disableImageResize: true, disableImageSettingsButton: true }),
    tablePlugin(),
    codeBlockPlugin({ codeBlockEditorDescriptors: [codeFenceEditor] }),
    jsxPlugin({ jsxComponentDescriptors: planJsxDescriptors }),
    // After jsxPlugin: it replaces MDX's writer for a data table's tags.
    dataTableMarkdownPlugin(),
    slashMenuPlugin(),
    slashHintPlugin(),
    lockedCardsPlugin(),
    blockHandlesPlugin(),
    markdownShortcutPlugin(),
  ]
}

/**
 * A keystroke never needs to move the page so far that the field being typed in leaves the screen.
 * Some browsers do that when the editor updates around a focused field; put the page back.
 */
export function useKeepTypingInView(surface: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const node = surface.current
    if (!node) return
    let typedAt = 0
    let scrollY = window.scrollY
    const typed = () => {
      typedAt = performance.now()
      scrollY = window.scrollY
    }
    const onScroll = () => {
      if (performance.now() - typedAt > 600) return
      const active = document.activeElement
      if (!(active instanceof HTMLElement) || !node.contains(active)) return
      const rect = caretRect(active)
      if (rect.bottom < 0 || rect.top > window.innerHeight) window.scrollTo(0, scrollY)
    }
    for (const type of ['keydown', 'beforeinput', 'input'] as const) node.addEventListener(type, typed, true)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      for (const type of ['keydown', 'beforeinput', 'input'] as const) node.removeEventListener(type, typed, true)
      window.removeEventListener('scroll', onScroll)
    }
  }, [surface])
}

function caretRect(active: HTMLElement): DOMRect {
  if (active.isContentEditable) {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const rect = selection.getRangeAt(0).getBoundingClientRect()
      if (rect.height > 0) return rect
    }
  }
  return active.getBoundingClientRect()
}

