import { addComposerChild$, addNestedEditorChild$, NESTED_EDITOR_UPDATED_COMMAND, realmPlugin } from '@mdxeditor/editor'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isDecoratorNode,
  $isParagraphNode,
  $isRangeSelection,
  $setSelection,
  getNearestEditorFromDOMNode,
  SKIP_DOM_SELECTION_TAG,
  SKIP_SCROLL_INTO_VIEW_TAG,
  RootNode,
  type LexicalEditor,
  type LexicalNode,
  type ParagraphNode,
} from 'lexical'
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'

/**
 * Block handles, like a block editor's side menu: a grip to drag a block to another place, and in
 * the top-level document a gray + bar under the block to add one below it. Tapping the grip
 * opens Add below, Move up, Move down, and Delete, so touch screens can reorder too. A card's
 * body has the grip only.
 */

type Level = 'root' | 'nested'
type Drop = { beforeKey: string } | { afterKey: string }
type Bar = { top: number; left: number; width: number }

/** Height of the + bar, and the room the last block leaves under it. Match planEditor.css. */
const BAR_HEIGHT = 16
const BAR_ROOM = 24
/** How long the grip's menu takes to fade out. Match planEditor.css. */
const MENU_OUT_MS = 120

/**
 * A card body is its own editor, and only tells the plan about its text when it loses focus.
 * Push it now, so a draft, a move, or a publish sees what was just typed.
 */
/**
 * When a card field or a card body takes focus, the editors around it forget their own caret.
 * Otherwise the next update of an outer editor puts its old caret back, which takes focus from
 * the card and scrolls the page to that caret (often the top of the plan).
 */
export function releaseOuterCarets(target: EventTarget | null): void {
  if (!(target instanceof HTMLElement)) return
  const nearest = getNearestEditorFromDOMNode(target)
  if (!nearest) return
  // A card body is an editor of its own; its caret stays. A field inside a card is not, so the card's editor lets go too.
  const ownsCaret = target.isContentEditable && nearest.getRootElement() === target
  let editor: LexicalEditor | null = ownsCaret ? nearest._parentEditor : nearest
  while (editor) {
    const outer = editor
    const hasCaret = outer.getEditorState().read(() => $getSelection() !== null)
    if (hasCaret) outer.update(() => $setSelection(null), { tag: [SKIP_DOM_SELECTION_TAG, SKIP_SCROLL_INTO_VIEW_TAG] })
    editor = outer._parentEditor
  }
}

export function syncFocusedNestedEditor(): void {
  const active = document.activeElement
  if (!active) return
  const editor = getNearestEditorFromDOMNode(active)
  if (editor && editor._parentEditor) editor.dispatchCommand(NESTED_EDITOR_UPDATED_COMMAND, undefined)
}

function blockKeys(editor: LexicalEditor): string[] {
  return editor.getEditorState().read(() => $getRoot().getChildrenKeys())
}

function isEmptyLine(node: LexicalNode | null): node is ParagraphNode {
  return $isParagraphNode(node) && node.getTextContent() === ''
}

function blocks(editor: LexicalEditor): Array<{ key: string; element: HTMLElement }> {
  return blockKeys(editor).flatMap((key) => {
    const element = editor.getElementByKey(key)
    return element ? [{ key, element }] : []
  })
}

/** The top-level block that holds `target`, if it is inside this editor. */
function blockOf(editor: LexicalEditor, target: EventTarget | null): string | null {
  const root = editor.getRootElement()
  if (!root || !(target instanceof Node) || !root.contains(target)) return null
  let element: Element | null = target instanceof Element ? target : target.parentElement
  while (element && element.parentElement !== root) element = element.parentElement
  if (!element) return null
  return blocks(editor).find((block) => block.element === element)?.key ?? null
}

/**
 * The block level with the pointer, or the nearest one. The gap under a block belongs to it,
 * so the + bar there stays while the pointer moves down to it.
 */
function blockAt(editor: LexicalEditor, y: number): string | null {
  const list = blocks(editor)
  let nearest: string | null = null
  let distance = Infinity
  for (const [index, { key, element }] of list.entries()) {
    const rect = element.getBoundingClientRect()
    const end = list[index + 1]?.element.getBoundingClientRect().top ?? rect.bottom + BAR_ROOM
    if (y >= rect.top - (index === 0 ? 8 : 0) && y < end) return key
    const gap = Math.min(Math.abs(y - rect.top), Math.abs(y - end))
    if (gap < distance) {
      distance = gap
      nearest = key
    }
  }
  return distance < 40 ? nearest : null
}

/** Where a dragged block would land, and where to draw the line for it. */
function dropAt(editor: LexicalEditor, y: number, dragged: string): { drop: Drop; lineY: number } | null {
  const others = blocks(editor).filter((block) => block.key !== dragged)
  if (others.length === 0) return null
  for (const { key, element } of others) {
    const rect = element.getBoundingClientRect()
    if (y < rect.top + rect.height / 2) return { drop: { beforeKey: key }, lineY: rect.top - 6 }
  }
  const last = others[others.length - 1]!
  return { drop: { afterKey: last.key }, lineY: last.element.getBoundingClientRect().bottom + 6 }
}

/** Keeps a menu on screen a moment after it closes, so it can animate out. */
function usePresence(open: boolean, ms: number): 'open' | 'closing' | null {
  const [state, setState] = useState<'open' | 'closing' | null>(open ? 'open' : null)
  useEffect(() => {
    if (open) {
      setState('open')
      return
    }
    setState((current) => (current ? 'closing' : null))
    const timer = setTimeout(() => setState(null), ms)
    return () => clearTimeout(timer)
  }, [open, ms])
  return open ? 'open' : state
}

function BlockHandles({ level }: { level: Level }) {
  const [editor] = useLexicalComposerContext()
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [key, setKey] = useState<string | null>(null)
  const [top, setTop] = useState(0)
  const [menu, setMenu] = useState(false)
  const [line, setLine] = useState<number | null>(null)
  const [bar, setBar] = useState<Bar | null>(null)
  const menuPresence = usePresence(menu, MENU_OUT_MS)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const handlesRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ key: string; pointerId: number; startY: number; moved: boolean; drop: Drop | null } | null>(null)
  const inHandles = useCallback(
    (target: EventTarget | null) =>
      target instanceof Node && Boolean(handlesRef.current?.contains(target) || barRef.current?.contains(target)),
    [],
  )

  // The handles sit beside the editor's text, in its parent.
  useEffect(
    () =>
      editor.registerRootListener((root) => {
        const parent = root?.parentElement ?? null
        if (parent && getComputedStyle(parent).position === 'static') parent.style.position = 'relative'
        setContainer(parent)
      }),
    [editor],
  )

  // Always keep a line after the last card, so there is somewhere to type below it.
  useEffect(
    () =>
      editor.registerNodeTransform(RootNode, (root) => {
        const last = root.getLastChild()
        if (last === null || $isDecoratorNode(last)) root.append($createParagraphNode())
      }),
    [editor],
  )

  const cancelHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = undefined
  }, [])
  const scheduleHide = useCallback(() => {
    cancelHide()
    hideTimer.current = setTimeout(() => {
      if (drag.current || menu) return
      if (inHandles(document.activeElement)) return
      setKey(null)
    }, 600)
  }, [cancelHide, inHandles, menu])

  // Follow the pointer on a screen with one, and the caret or the focused field everywhere.
  useEffect(() => {
    if (!container) return
    const onMove = (event: globalThis.PointerEvent) => {
      if (drag.current || menu || event.pointerType === 'touch') return
      if (inHandles(event.target)) return
      const found = blockAt(editor, event.clientY)
      if (found) {
        cancelHide()
        setKey(found)
      }
    }
    const onFocus = (event: FocusEvent) => {
      if (inHandles(event.target)) return
      const found = blockOf(editor, event.target)
      if (found) {
        cancelHide()
        setKey(found)
      }
    }
    container.addEventListener('pointermove', onMove)
    container.addEventListener('pointerleave', scheduleHide)
    container.addEventListener('focusin', onFocus)
    return () => {
      container.removeEventListener('pointermove', onMove)
      container.removeEventListener('pointerleave', scheduleHide)
      container.removeEventListener('focusin', onFocus)
    }
  }, [cancelHide, container, editor, inHandles, menu, scheduleHide])

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        if (drag.current || menu) return
        const caret = editorState.read(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return null
          return selection.anchor.getNode().getTopLevelElement()?.getKey() ?? null
        })
        if (caret && editor.getRootElement()?.contains(document.activeElement)) setKey(caret)
      }),
    [editor, menu],
  )

  // Line the handles up with the block, also after it grows or the layout moves.
  const place = useCallback(() => {
    if (!container || !key) return
    const element = editor.getElementByKey(key)
    if (!element) {
      setKey(null)
      return
    }
    const rect = element.getBoundingClientRect()
    const box = container.getBoundingClientRect()
    setTop(rect.top - box.top)
    if (level !== 'root') return
    // The bar sits in the middle of the gap under the block, as wide as the block.
    const next = element.nextElementSibling?.getBoundingClientRect().top ?? rect.bottom + BAR_ROOM
    setBar({
      top: rect.bottom + Math.max(0, next - rect.bottom - BAR_HEIGHT) / 2 - box.top,
      left: rect.left - box.left,
      width: rect.width,
    })
  }, [container, editor, key, level])
  useLayoutEffect(place, [place])
  useEffect(() => {
    window.addEventListener('resize', place)
    // An update listener's return value is its cleanup, so return nothing.
    const stop = editor.registerUpdateListener(() => {
      requestAnimationFrame(place)
    })
    return () => {
      window.removeEventListener('resize', place)
      stop()
    }
  }, [editor, place])

  // A block can also change size on its own, like a mermaid figure drawn after typing stops.
  useEffect(() => {
    const element = key ? editor.getElementByKey(key) : null
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => place())
    observer.observe(element)
    return () => observer.disconnect()
  }, [editor, key, place])

  useEffect(() => {
    if (!menu) return
    const close = (event: Event) => {
      if (!handlesRef.current?.contains(event.target as Node)) setMenu(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menu])

  // A body edit reaches the plan only through its card, so tell the card after each change here.
  const change = useCallback(
    (fn: () => void) => {
      syncFocusedNestedEditor()
      editor.update(fn, { discrete: true })
      if (level === 'nested') editor.dispatchCommand(NESTED_EDITOR_UPDATED_COMMAND, undefined)
      requestAnimationFrame(place)
    },
    [editor, level, place],
  )

  const move = useCallback(
    (moved: string, drop: Drop) =>
      change(() => {
        const node = $getNodeByKey(moved)
        const target = $getNodeByKey('beforeKey' in drop ? drop.beforeKey : drop.afterKey)
        if (!node || !target || node.is(target)) return
        if ('beforeKey' in drop) target.insertBefore(node)
        else target.insertAfter(node)
      }),
    [change],
  )

  const step = useCallback(
    (direction: -1 | 1) => {
      if (!key) return
      const keys = blockKeys(editor)
      const index = keys.indexOf(key)
      const neighbour = keys[index + direction]
      if (index < 0 || !neighbour) return
      move(key, direction < 0 ? { beforeKey: neighbour } : { afterKey: neighbour })
    },
    [editor, key, move],
  )

  /**
   * Add an empty line below the block with a `/` in it, which opens the card menu. The menu's
   * Text keeps it a paragraph. An empty line already there is used instead of a new one.
   */
  const addBelow = useCallback(() => {
    if (!key) return
    setMenu(false)
    let added: string | null = null
    change(() => {
      const node = $getNodeByKey(key)
      if (!node) return
      const next = node.getNextSibling()
      let paragraph = isEmptyLine(node) ? node : isEmptyLine(next) ? next : null
      if (!paragraph) {
        paragraph = $createParagraphNode()
        node.insertAfter(paragraph)
      }
      paragraph.clear()
      paragraph.append($createTextNode('/'))
      paragraph.selectEnd()
      added = paragraph.getKey()
    })
    // A code editor or card field keeps focus through the + (it does not take focus on press), and
    // the plan's editor counts focus inside it as its own. Let go of it, so the "/" line gets the keys.
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== editor.getRootElement()) active.blur()
    editor.focus()
    if (added) setKey(added)
  }, [change, editor, key])

  const remove = useCallback(() => {
    if (!key) return
    setMenu(false)
    change(() => $getNodeByKey(key)?.remove())
    setKey(null)
  }, [change, key])

  function onGripDown(event: PointerEvent<HTMLButtonElement>) {
    if (!key || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { key, pointerId: event.pointerId, startY: event.clientY, moved: false, drop: null }
  }

  function onGripMove(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId || !container) return
    if (!current.moved && Math.abs(event.clientY - current.startY) < 5) return
    if (!current.moved) {
      current.moved = true
      setMenu(false)
      editor.getElementByKey(current.key)?.setAttribute('data-block-dragging', 'true')
    }
    // Scroll near the top or bottom of the screen, so a block can travel far.
    if (event.clientY < 80) window.scrollBy(0, -14)
    else if (event.clientY > window.innerHeight - 80) window.scrollBy(0, 14)
    const found = dropAt(editor, event.clientY, current.key)
    current.drop = found?.drop ?? null
    setLine(found ? found.lineY - container.getBoundingClientRect().top : null)
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>, cancelled: boolean) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    drag.current = null
    setLine(null)
    editor.getElementByKey(current.key)?.removeAttribute('data-block-dragging')
    if (!current.moved) {
      if (!cancelled) setMenu((open) => !open)
      return
    }
    if (!cancelled && current.drop) move(current.key, current.drop)
  }

  function onGripKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      step(event.key === 'ArrowUp' ? -1 : 1)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setMenu((open) => !open)
    } else if (event.key === 'Escape') {
      setMenu(false)
    }
  }

  if (!container) return null
  const keys = key ? blockKeys(editor) : []
  const index = key ? keys.indexOf(key) : -1
  return createPortal(
    <>
      <div
        ref={handlesRef}
        className="plan-block-handles"
        data-level={level}
        data-plan-grab-ignore=""
        hidden={!key}
        style={{ top }}
        onPointerEnter={cancelHide}
        onPointerLeave={scheduleHide}
      >
        <button
          type="button"
          className="plan-block-button plan-block-grip"
          aria-label="Drag to move this block, or open its actions"
          title="Drag to move · click for actions"
          aria-haspopup="menu"
          aria-expanded={menu}
          data-block-grip=""
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={(event) => endDrag(event, false)}
          onPointerCancel={(event) => endDrag(event, true)}
          onKeyDown={onGripKey}
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
        {menuPresence ? (
          <div
            className="plan-block-menu"
            role="menu"
            aria-label="Block actions"
            data-closing={menuPresence === 'closing' ? '' : undefined}
            inert={menuPresence === 'closing'}
          >
            <button type="button" role="menuitem" onClick={addBelow}>
              <Plus size={14} aria-hidden="true" /> Add below
            </button>
            <button type="button" role="menuitem" disabled={index <= 0} onClick={() => step(-1)} data-block-move="up">
              <ArrowUp size={14} aria-hidden="true" /> Move up
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={index < 0 || index >= keys.length - 1}
              onClick={() => step(1)}
              data-block-move="down"
            >
              <ArrowDown size={14} aria-hidden="true" /> Move down
            </button>
            <button type="button" role="menuitem" className="plan-block-menu-danger" onClick={remove}>
              <Trash2 size={14} aria-hidden="true" /> Delete
            </button>
          </div>
        ) : null}
      </div>
      {level === 'root' ? (
        <button
          ref={barRef}
          type="button"
          className="plan-block-add"
          aria-label="Add a block below"
          title="Add a block below"
          data-block-add=""
          data-plan-grab-ignore=""
          hidden={!key || !bar || line !== null}
          style={bar ? { top: bar.top, left: bar.left, width: bar.width } : undefined}
          onPointerEnter={cancelHide}
          onPointerLeave={scheduleHide}
          onMouseDown={(event) => event.preventDefault()}
          onClick={addBelow}
        >
          <Plus size={12} strokeWidth={2.25} aria-hidden="true" />
        </button>
      ) : null}
      {line !== null ? <div className="plan-block-drop-line" style={{ top: line }} aria-hidden="true" /> : null}
    </>,
    container,
  )
}

function RootBlockHandles() {
  return <BlockHandles level="root" />
}

function NestedBlockHandles() {
  return <BlockHandles level="nested" />
}

export const blockHandlesPlugin = realmPlugin({
  init(realm) {
    realm.pubIn({
      [addComposerChild$]: RootBlockHandles,
      [addNestedEditorChild$]: NestedBlockHandles,
    })
  },
})
