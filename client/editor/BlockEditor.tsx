import { MDXEditor, type MDXEditorMethods } from '@mdxeditor/editor'
import {
  $createRangeSelectionFromDom,
  $getRoot,
  $getSelection,
  $isDecoratorNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  getNearestEditorFromDOMNode,
} from 'lexical'
import '@mdxeditor/editor/style.css'
import { $isHeadingNode } from '@lexical/rich-text'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { applyBlockEdit, applyCellEdit, blockEditorText, cellEditorText, samePlanSource, type BlockRange } from '../../src/planMdx/blockEdit.ts'
import { remapBlockStart } from '../../src/planMdx/remarkBlockRanges.ts'
import { planNotReadyReason } from '../../src/planReady.ts'
import { placeSelection, selectionIn } from '../caretSpot.ts'
import { isTap, isTouchPointer } from '../pointerKind.ts'
import { standInOf, type EditCaret, type EditFollow } from '../planEditButton.ts'
import { Button } from '../ui/button.tsx'
import { releaseOuterCarets, syncFocusedNestedEditor } from './blockHandles.tsx'
import { focusFence } from './codeFence.tsx'
import { iconFor, planEditorPlugins, planLexicalTheme, useKeepTypingInView } from './editorSetup.tsx'
import './planEditor.css'

/**
 * What the editor changes: one block of the plan, a new block after one (after the last when null),
 * or the text of one pipe table cell. Text opens `inline`: it keeps its look and place on the page.
 * Every editor opens where its block sits with no frame and no bar: a card shows only its own editor.
 */
export type BlockTarget =
  | { kind: 'edit'; range: BlockRange; inline?: boolean }
  | { kind: 'add'; after: BlockRange | null; inline?: boolean }
  | { kind: 'cell'; range: BlockRange }

export type BlockEditorProps = {
  /** The plan file the page shows. The block's range is a place in it. */
  source: string
  target: BlockTarget
  /**
   * Keep the plan file with this edit as an unapplied change. Resolves to an error to show, or null.
   * `follow` is the block that opens once the page shows the change (Enter split the text).
   */
  commit: (next: string, follow?: EditFollow) => Promise<string | null>
  /** Close without a change, then open `follow` when Enter asked for a new block. */
  onCancel: (follow?: EditFollow) => void
  /** Done kept the edit and the page is drawing it: the editor stays where it is, as it is, and takes no input. */
  closing?: boolean
  /** Hands the page this editor's Done, so a move of a block can finish the edit first. Null when it closes. */
  registerDone?: (done: (() => void) | null) => void
  /** The `data-plan-block` of the block this editor stands in for, when that block moves (client/planBlockMove.ts). */
  blockRange?: string
  /** Where the caret goes: where the click on the block landed. At the end when not given. */
  caret?: EditCaret
  /** The margins of the block it stands in for, so inline text does not move. */
  margins?: { top: string; bottom: string }
  /** The height of the text it stands in for, held until the editor's own text is in, so the page does not jump. */
  height?: number
  /**
   * The page still draws the block, right before this editor, until the editor's own text is in. The
   * editor waits over it unseen (it takes the caret meanwhile), so opening a block never blanks it.
   */
  staged?: boolean
  /** The editor's text is in: the page takes the block it stood over away, and the editor shows in its place. */
  onShown?: () => void
  /** Something was typed that is not kept yet: the page counts it among the changes to apply. */
  onDirty?: (dirty: boolean) => void
}

/**
 * Menus and dialogs the editor opens outside its own box. A click in one is still editing. So is a
 * press on the bar of unapplied changes (Apply finishes the edit itself, and Discard drops it) and on
 * the card's pill beside open text: its Edit and + finish the edit themselves, then act.
 */
const EDITOR_POPUPS =
  '.plan-slash-menu, .plan-block-handles, .plan-block-menu, .plan-insert-prompt, .mdxeditor-popup-container, [role="dialog"], [role="listbox"], [role="menu"], [data-plan-apply-bar], [data-plan-block-tools], [data-plan-add-bar]'

function insideEditor(surface: HTMLElement, target: EventTarget | null): boolean {
  return target instanceof Node && (surface.contains(target) || (target instanceof Element && target.closest(EDITOR_POPUPS) !== null))
}

/**
 * The editor adds an empty line after a heading, a list, or a quote, to type below it. A block edited
 * where it sits keeps no such line unless the caret is on it (Enter at the end made it), so the
 * blocks under it stay where they were. The line after a card stays (the editor puts it back), and
 * planEditor.css hides it. Returns the cleanup.
 */
function keepNoTrailingLine(content: HTMLElement): () => void {
  const editor = getNearestEditorFromDOMNode(content)
  if (!editor) return () => undefined
  const drop = () => {
    const extra = editor.getEditorState().read(() => {
      const root = $getRoot()
      const last = root.getLastChild()
      if (root.getChildrenSize() < 2 || !$isParagraphNode(last) || last.getChildrenSize() > 0) return false
      if ($isDecoratorNode(last.getPreviousSibling())) return false
      const selection = $getSelection()
      return !($isRangeSelection(selection) && selection.anchor.getNode().is(last))
    })
    if (!extra) return
    editor.update(() => {
      const last = $getRoot().getLastChild()
      if ($isParagraphNode(last) && last.getChildrenSize() === 0) last.remove()
    }, { tag: 'history-merge' })
  }
  drop()
  return editor.registerUpdateListener(drop)
}

/**
 * Put the caret where the click landed, or select the text a double or triple click did: in the text,
 * or in a data table's cell. Cells appear a frame or two after the table.
 */
function placeOpeningCaret(surface: HTMLElement, caret: EditCaret, frames = 12): void {
  const attempt = (left: number) => {
    const content =
      caret.row !== undefined && caret.column !== undefined
        ? surface.querySelector<HTMLElement>(`[data-dt-cell="${caret.row}:${caret.column}"] .plan-dt-cell-content`)
        : surface.querySelector<HTMLElement>('.plan-editor-content')
    if (!content) {
      if (left > 0) requestAnimationFrame(() => attempt(left - 1))
      return
    }
    content.focus({ preventScroll: true })
    if (!placeSelection(content, caret.offset, caret.end ?? caret.offset)) return
    // The editor takes a caret moved right after its own focus for its own; tell it where the caret is.
    const editor = getNearestEditorFromDOMNode(content)
    editor?.update(() => {
      const selection = $createRangeSelectionFromDom(window.getSelection(), editor)
      if (selection) $setSelection(selection)
    })
  }
  attempt(frames)
}

/**
 * What the reader selected on the text an inline editor opens over, while the editor waits there
 * unseen: the second click of a double click selects a word, the third the line. The editor takes it
 * before the page stops drawing that text. Null when the selection is not on that text.
 */
function selectedOnStandIn(surface: HTMLElement): EditCaret | null {
  const standIn = standInOf(surface)
  // A cell's editor is drawn inside the cell, after the text it stands in for.
  const picked = standIn ? selectionIn(standIn, standIn === surface.parentElement ? surface : undefined) : null
  return picked ? { offset: picked.start, end: picked.end } : null
}

/** The lines of the editor's text: a triple click selects one of them. */
const TEXT_LINE = 'p, h1, h2, h3, h4, h5, h6, li, blockquote'

/**
 * Keep a triple click's selection to the line it selected: a paragraph, a heading, a list item. The
 * browser runs it on into the start of the next line, so typing over it would join the two lines.
 */
function keepToLine(content: HTMLElement): void {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
  const range = selection.getRangeAt(0)
  const start = range.startContainer
  const line = (start instanceof Element ? start : start.parentElement)?.closest(TEXT_LINE)
  if (!line || !content.contains(line)) return
  const whole = document.createRange()
  whole.selectNodeContents(line)
  if (whole.comparePoint(range.endContainer, range.endOffset) <= 0) return
  selection.setBaseAndExtent(range.startContainer, range.startOffset, line, line.childNodes.length)
  const editor = getNearestEditorFromDOMNode(line)
  editor?.update(() => {
    const next = $createRangeSelectionFromDom(window.getSelection(), editor)
    if (next) $setSelection(next)
  })
}

/** The fields a card's editor opens with the caret in: its first text field or nested editor, never a picker. */
const CARD_FIELDS =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([disabled]):not([role="combobox"]), textarea:not([disabled]), [contenteditable="true"]'

/** The fields under `root` in reading order, looking into open shadow roots too (a code editor types in one). */
function fieldsIn(root: ParentNode): HTMLElement[] {
  const found: HTMLElement[] = []
  for (const element of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    if (element.matches(CARD_FIELDS)) found.push(element)
    if (element.shadowRoot) found.push(...fieldsIn(element.shadowRoot))
  }
  return found
}

/**
 * A card opens with the caret in its first field, so typing changes the card. A code block or a
 * diagram opens with the caret in its code. Fields can appear a frame or two late.
 */
function focusFirstField(surface: HTMLElement, frames = 12): void {
  const content = surface.querySelector<HTMLElement>('.plan-editor-content')
  const lexical = content ? getNearestEditorFromDOMNode(content) : null
  const code = lexical?.getEditorState().read(() => {
    const first = $getRoot().getFirstChild()
    return first && first.getType() === 'codeblock' ? first.getKey() : null
  })
  if (code) {
    focusFence(code)
    return
  }
  const field = content ? fieldsIn(content).find((element) => element !== content && element.getClientRects().length > 0) : undefined
  if (!field) {
    if (frames > 0) requestAnimationFrame(() => focusFirstField(surface, frames - 1))
    else content?.focus({ preventScroll: true })
    return
  }
  field.focus({ preventScroll: true })
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    const end = field.value.length
    field.setSelectionRange(end, end)
  }
}

/**
 * Where the block an editor waits over is drawn: the element right before it, or for a table cell
 * the cell's own box. The editor takes the width it will have in its place, its parent's.
 */
function standInBox(node: HTMLElement, cell: boolean): { top: number; left: number; width: number } | null {
  const parent = node.parentElement
  if (!parent) return null
  const style = getComputedStyle(parent)
  const box = parent.getBoundingClientRect()
  const px = (value: string) => Number.parseFloat(value) || 0
  const left = box.left + px(style.borderLeftWidth) + px(style.paddingLeft)
  const width = parent.clientWidth - px(style.paddingLeft) - px(style.paddingRight)
  if (cell) return { top: box.top + px(style.borderTopWidth) + px(style.paddingTop), left, width }
  const before = node.previousElementSibling
  return before ? { top: before.getBoundingClientRect().top, left, width } : null
}

/**
 * One block of the plan, open for editing where it sits on the page (ADR 0040). Done keeps the edit
 * on this device and shows it on the page; nothing reaches the plan until Apply changes.
 */
export function BlockEditor({
  source,
  target,
  commit,
  onCancel,
  caret,
  margins,
  height,
  closing = false,
  registerDone,
  blockRange,
  staged = false,
  onShown,
  onDirty,
}: BlockEditorProps) {
  const editor = useRef<MDXEditorMethods>(null)
  const surface = useRef<HTMLDivElement>(null)
  // Text and table cells are edited as they read: no frame, no bar, and a click elsewhere is Done.
  const inline = target.kind === 'cell' || ((target.kind === 'edit' || target.kind === 'add') && target.inline === true)
  // Read once: the page keeps showing this source while the editor is open.
  const [markdown] = useState(() =>
    target.kind === 'edit' ? blockEditorText(source, target.range) : target.kind === 'cell' ? cellEditorText(source, target.range) : '',
  )
  const plugins = useMemo(planEditorPlugins, [])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const loaded = useRef<string | null>(null)
  // Something was typed. Kept out of React state on purpose: a render of the editor while a card's
  // field has the caret would hand that field its old value back (MDXEditor updates its plugins on
  // every render), so a change is noted without one.
  const dirty = useRef(false)
  const onDirtyRef = useRef(onDirty)
  onDirtyRef.current = onDirty
  const closingNow = useRef(closing)
  closingNow.current = closing
  const markDirty = () => {
    if (dirty.current || closingNow.current) return
    dirty.current = true
    // What was typed counts among the changes to apply from the first key, as the page shows it.
    onDirtyRef.current?.(true)
  }
  const markDirtyRef = useRef(markDirty)
  markDirtyRef.current = markDirty
  // The editor draws its text a frame or two after it mounts (a card's fields a frame later still).
  // Until then the page draws the block under it (`staged`), or the editor holds the text's height.
  const [filled, setFilled] = useState(false)
  useEffect(() => {
    if (filled) return
    let frame = 0
    let left = 20
    let last = -1
    const check = () => {
      const content = surface.current?.querySelector<HTMLElement>('.plan-editor-content')
      const tall = content && content.childElementCount > 0 ? content.getBoundingClientRect().height : -1
      // Its text is in once it is drawn and kept its height for a frame.
      if ((tall > 0 && tall === last) || left <= 0) {
        setFilled(true)
        return
      }
      last = tall
      left -= 1
      frame = requestAnimationFrame(check)
    }
    frame = requestAnimationFrame(check)
    return () => cancelAnimationFrame(frame)
  }, [filled])
  const shownRef = useRef(onShown)
  shownRef.current = onShown
  useEffect(() => {
    if (!filled || !staged) return
    // A double or triple click that went on after the editor took the caret selected on the text it
    // stands in for: the editor takes that selection before the page stops drawing the text.
    const node = surface.current
    const picked = node ? selectedOnStandIn(node) : null
    if (node && picked) placeOpeningCaret(node, picked)
    shownRef.current?.()
  }, [filled, staged])

  // Waiting unseen over the block it stands in for: right where that block's text is, so the caret
  // it takes is in view and the browser does not scroll to it.
  useLayoutEffect(() => {
    const node = surface.current
    if (!staged || !node) return
    node.style.removeProperty('--stage-top')
    node.style.removeProperty('--stage-left')
    const box = standInBox(node, target.kind === 'cell')
    if (!box) return
    const at = node.getBoundingClientRect()
    node.style.setProperty('--stage-width', `${box.width}px`)
    node.style.setProperty('--stage-top', `${box.top - at.top}px`)
    node.style.setProperty('--stage-left', `${box.left - at.left}px`)
  }, [staged, target.kind])

  useKeepTypingInView(surface)

  // The caret goes into the block, where the click on it landed, so typing can start right away. A new block shows the `/` hint.
  useEffect(() => {
    let stopTrailing = () => {}
    let stopDrawn = () => {}
    let stopped = false
    let wait = 0
    const frame = requestAnimationFrame(() => {
      const node = surface.current
      loaded.current = editor.current?.getMarkdown() ?? null
      // Inline text with no click to follow (E) puts the caret at the end of its text.
      const at = caret ?? (inline ? { offset: Number.MAX_SAFE_INTEGER } : undefined)
      const opened = (selected?: EditCaret) => {
        if (!node) return
        const content = node.querySelector<HTMLElement>('.plan-editor-content')
        if (content && !stopped) stopTrailing = keepNoTrailingLine(content)
        const place = selected ?? at
        if (place) placeOpeningCaret(node, place)
      }
      const focusOptions = { defaultSelection: 'rootEnd', preventScroll: true } as const
      // Text takes the focus as soon as its editor is in the page, as the editor's own focus would,
      // so no key typed after the click is lost. Right before, in the same task, it reads what a
      // double or triple click quicker than the editor selected on the text (a word, the line): no
      // click comes between, and the focus moves the selection. The editor opens with it selected.
      if (inline) {
        const begin = (): boolean => {
          const content = node?.querySelector<HTMLElement>('.plan-editor-content')
          const lexical = content ? getNearestEditorFromDOMNode(content) : null
          if (!node || !lexical || stopped) return false
          const picked = selectedOnStandIn(node)
          lexical.focus(() => opened(picked && picked.end !== picked.offset ? picked : undefined), focusOptions)
          return true
        }
        if (node && !begin()) {
          // The editor draws its text a moment later: begin in the task that draws it.
          const drawn = new MutationObserver(() => {
            if (begin() || stopped) drawn.disconnect()
          })
          drawn.observe(node, { childList: true, subtree: true })
          stopDrawn = () => drawn.disconnect()
        }
        return
      }
      // A card opens with the caret in its first field, not on the line under it. Its editor draws a frame or two late.
      if (!at) {
        let left = 20
        const card = () => {
          const content = node?.querySelector<HTMLElement>('.plan-editor-content')
          if (!node || stopped) return
          if (!content) {
            if (left-- > 0) wait = requestAnimationFrame(card)
            return
          }
          stopTrailing = keepNoTrailingLine(content)
          focusFirstField(node)
        }
        card()
        return
      }
      editor.current?.focus(() => opened(), focusOptions)
    })
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(wait)
      stopped = true
      stopDrawn()
      stopTrailing()
    }
    // Once, when the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A triple click in the text selects the line it lands on, and no more.
  useEffect(() => {
    const node = surface.current
    if (!node || !inline) return
    const onClick = (event: MouseEvent) => {
      const content = node.querySelector<HTMLElement>('.plan-editor-content')
      if (event.detail >= 3 && content && event.target instanceof Node && content.contains(event.target)) keepToLine(content)
    }
    node.addEventListener('click', onClick)
    return () => node.removeEventListener('click', onClick)
  }, [inline])

  useEffect(() => {
    const node = surface.current
    if (!node) return
    // Heard on the way down: a card's fields and cells keep their own events to themselves.
    const changed = () => markDirtyRef.current()
    const focused = (event: FocusEvent) => releaseOuterCarets(event.target)
    node.addEventListener('input', changed, true)
    node.addEventListener('change', changed, true)
    node.addEventListener('focusin', focused)
    return () => {
      node.removeEventListener('input', changed, true)
      node.removeEventListener('change', changed, true)
      node.removeEventListener('focusin', focused)
    }
  }, [])

  // Kept or closed: nothing typed waits in this editor any more.
  useEffect(() => {
    if (closing && dirty.current) onDirtyRef.current?.(false)
  }, [closing])
  useEffect(() => () => onDirtyRef.current?.(false), [])

  // Typing that is not Done yet lives only in this editor. Leaving the page asks first.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty.current || closingNow.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  async function finish(edited: string, follow?: EditFollow) {
    setMessage(null)
    let next: string
    try {
      next =
        target.kind === 'cell'
          ? applyCellEdit(source, target.range, edited)
          : target.kind === 'edit'
            ? applyBlockEdit(source, { kind: 'replace', range: target.range, edited })
            : applyBlockEdit(source, { kind: 'insert', after: target.after, edited })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'This block cannot be read as part of a plan yet.')
      return
    }
    if (samePlanSource(next, source)) {
      onCancel(follow)
      return
    }
    setBusy(true)
    try {
      const reason = await planNotReadyReason(next)
      if (reason) {
        setMessage(`This block does not render yet. ${reason}`)
        return
      }
      const error = await commit(next, follow)
      if (error) setMessage(error)
      // Otherwise the page closes this editor once it shows the new block.
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not keep this change')
    } finally {
      setBusy(false)
    }
  }

  const finishing = useRef(false)
  // Done kept the edit: a second Done (a grip pressed while the page draws it) changes nothing.
  const closingRef = useRef(closing)
  closingRef.current = closing
  function onDone() {
    if (finishing.current || closingRef.current) return
    syncFocusedNestedEditor()
    const edited = editor.current?.getMarkdown()
    if (edited === undefined) return
    if (loaded.current !== null && edited === loaded.current && target.kind !== 'add') {
      onCancel()
      return
    }
    finishing.current = true
    void finish(edited).finally(() => {
      finishing.current = false
    })
  }
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  /**
   * Enter in a paragraph or a heading edited as it reads makes a new block, as the page will draw
   * it: the text after the caret goes into the next block, which opens with the caret at its start,
   * and Enter at the end opens an empty block below. This editor keeps the text before the caret.
   * Lists, quotes, and code keep the editor's own Enter. Returns false when Enter is the editor's.
   */
  function splitOnEnter(): boolean {
    const node = surface.current
    const methods = editor.current
    if (!node || !methods || finishing.current || closingRef.current) return false
    if (target.kind !== 'edit' && !(target.kind === 'add' && target.after)) return false
    const content = node.querySelector<HTMLElement>('.plan-editor-content')
    const lexical = content ? getNearestEditorFromDOMNode(content) : null
    if (!content || !lexical) return false
    // The editor learns a caret moved by a key (End, an arrow) a moment later; Enter splits where the caret is now.
    const dom = window.getSelection()
    lexical.update(
      () => {
        const now = $createRangeSelectionFromDom(dom, lexical)
        if (now) $setSelection(now)
      },
      { discrete: true },
    )
    const text = lexical.getEditorState().read(() => {
      const root = $getRoot()
      const selection = $getSelection()
      if (root.getChildrenSize() !== 1 || !$isRangeSelection(selection)) return null
      const top = selection.anchor.getNode().getTopLevelElement()
      if (!top || !($isParagraphNode(top) || $isHeadingNode(top))) return null
      return root.getTextContent()
    })
    if (text === null) return false
    // An empty line has no block to make, and Enter before the first letter has no text to keep.
    if (!text.trim() || caretAtStart(content)) return true
    lexical.update(
      () => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return
        if (!selection.isCollapsed()) selection.removeText()
        // The spaces at the split end neither block: markdown would keep them as `&#x20;`.
        const node = selection.anchor.getNode()
        if ($isTextNode(node)) {
          const text = node.getTextContent()
          const at = selection.anchor.offset
          const before = /\s*$/.exec(text.slice(0, at))?.[0].length ?? 0
          const after = /^\s*/.exec(text.slice(at))?.[0].length ?? 0
          if (before + after > 0) node.spliceText(at - before, before + after, '', true)
        }
        $getSelection()?.insertParagraph()
      },
      { discrete: true },
    )
    // The markdown of both blocks, then of the first alone. The editor shows both while the page draws them.
    const split = lexical.getEditorState()
    const full = methods.getMarkdown()
    lexical.update(
      () => {
        for (const child of $getRoot().getChildren().slice(1)) child.remove()
      },
      { discrete: true },
    )
    const before = methods.getMarkdown()
    lexical.setEditorState(split)
    if (!before.trim() || !full.startsWith(before)) return true
    const after = full.slice(before.length).trim()
    // The edited block keeps its start; a new block starts after the one it was added below.
    const start = target.kind === 'edit' ? target.range.start : (target.after?.end ?? 0) + 2
    finishing.current = true
    void finish(after ? full : before, { open: after ? 'next' : 'add', start }).finally(() => {
      finishing.current = false
    })
    return true
  }
  const splitRef = useRef(splitOnEnter)
  splitRef.current = splitOnEnter

  /**
   * Backspace in an empty paragraph or heading removes the block (an empty new block just closes),
   * and the caret goes to the end of the block above, or to the start of the block below when it was
   * the first. Returns false when Backspace is the editor's.
   */
  function removeOnBackspace(): boolean {
    const node = surface.current
    if (!node || finishing.current || closingRef.current) return false
    if (target.kind !== 'edit' && !(target.kind === 'add' && target.after)) return false
    const content = node.querySelector<HTMLElement>('.plan-editor-content')
    const lexical = content ? getNearestEditorFromDOMNode(content) : null
    if (!lexical) return false
    const empty = lexical.getEditorState().read(() => {
      const root = $getRoot()
      const first = root.getFirstChild()
      return root.getChildrenSize() === 1 && ($isParagraphNode(first) || $isHeadingNode(first)) && first.getChildrenSize() === 0
    })
    if (!empty) return false
    // The blocks beside this one, as the page draws them now (not the block it still waits over).
    const own = target.kind === 'edit' ? `${target.range.start}-${target.range.end}` : null
    const above = blockBeside(node, -1, own)
    const below = above ? null : blockBeside(node, 1, own)
    const next = target.kind === 'edit' ? applyBlockEdit(source, { kind: 'replace', range: target.range, edited: '' }) : source
    const neighbour = above ?? below
    const start = neighbour ? Number(/^(\d+)-/.exec(neighbour.dataset.planBlock ?? neighbour.dataset.planText ?? '')?.[1]) : Number.NaN
    const moved = Number.isFinite(start) ? remapBlockStart(source, next, start) : null
    finishing.current = true
    void finish('', moved === null ? undefined : { open: above ? 'end' : 'start', start: moved }).finally(() => {
      finishing.current = false
    })
    return true
  }
  const removeRef = useRef(removeOnBackspace)
  removeRef.current = removeOnBackspace

  // The page can ask this editor to finish: a block's grip was pressed while it was open.
  const registerRef = useRef(registerDone)
  registerRef.current = registerDone
  useEffect(() => {
    registerRef.current?.(() => doneRef.current())
    return () => registerRef.current?.(null)
  }, [])

  // Ctrl or Cmd+Enter is Done, and in a cell, which is one line, so is Enter, as in a spreadsheet.
  // Caught before the editor sees it, or it would split the line at the caret first. So is Backspace
  // in an empty block, which the editor would ignore.
  useEffect(() => {
    const node = surface.current
    if (!node) return
    const onEnter = (event: globalThis.KeyboardEvent) => {
      if (event.isComposing) return
      if (event.key === 'Backspace') {
        const bare = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
        if (bare && inline && target.kind !== 'cell' && !document.querySelector('.plan-slash-menu') && removeRef.current()) {
          event.preventDefault()
          event.stopPropagation()
        }
        return
      }
      if (event.key !== 'Enter') return
      const chord = event.metaKey || event.ctrlKey
      const plain = !chord && !event.shiftKey && !event.altKey
      if (plain && inline && target.kind !== 'cell' && !document.querySelector('.plan-slash-menu') && splitRef.current()) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (!chord && (target.kind !== 'cell' || event.shiftKey || document.querySelector('.plan-slash-menu'))) return
      event.preventDefault()
      event.stopPropagation()
      doneRef.current()
    }
    node.addEventListener('keydown', onEnter, true)
    return () => node.removeEventListener('keydown', onEnter, true)
  }, [target.kind, inline])

  // No editor has a Done button: a press or a Tab out of it is Done, and keeps what was typed as one
  // more change to apply. Menus it opens are still part of it.
  useEffect(() => {
    const node = surface.current
    if (!node || closing) return
    // The text the editor opens over, while it waits there unseen. The second and third clicks of a
    // double or triple click land on it and select in it, for the editor to take once it shows.
    const onStandIn = (target: EventTarget | null) => target instanceof Node && standInOf(node)?.contains(target) === true
    // Such a press takes the focus from the editor, as a press on text does, until the editor shows.
    let pressedStandIn = false
    let pressTimer = 0
    const outside = (event: MouseEvent) => {
      if (insideEditor(node, event.target) || onStandIn(event.target)) return false
      // The window's scrollbar is not the page.
      return !(event.target === document.documentElement && event.clientX >= document.documentElement.clientWidth)
    }
    // A mouse finishes at the press. A finger finishes at a tap: its press may start a scroll.
    const onPointerDown = (event: PointerEvent) => {
      window.clearTimeout(pressTimer)
      pressedStandIn = onStandIn(event.target)
      // The press moves the focus as it goes down, before anything else runs.
      if (pressedStandIn) pressTimer = window.setTimeout(() => (pressedStandIn = false), 0)
      if (!isTouchPointer(event) && outside(event)) doneRef.current()
    }
    const onTap = (event: MouseEvent) => {
      if (isTap(event) && outside(event)) doneRef.current()
    }
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget
      if (next === null || insideEditor(node, next) || pressedStandIn) return
      doneRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('click', onTap, true)
    node.addEventListener('focusout', onFocusOut)
    return () => {
      window.clearTimeout(pressTimer)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('click', onTap, true)
      node.removeEventListener('focusout', onFocusOut)
    }
  }, [closing])

  // Escape closes menus first. With nothing typed, it also closes the editor; otherwise it keeps what
  // was typed. Heard on the way down, since a card's fields keep their keys to themselves, and acted
  // on once the key has gone through, so a menu inside that took it keeps it.
  const escapeRef = useRef(() => {})
  escapeRef.current = () => {
    if (!dirty.current) onCancel()
    else onDone()
  }
  useEffect(() => {
    const node = surface.current
    if (!node) return
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || document.querySelector('.plan-slash-menu')) return
      window.setTimeout(() => {
        if (!event.defaultPrevented && node.isConnected) escapeRef.current()
      }, 0)
    }
    node.addEventListener('keydown', onEscape, true)
    return () => node.removeEventListener('keydown', onEscape, true)
  }, [])

  // The editor itself renders once. MDXEditor updates every plugin on each of its renders, which hands
  // a card's field with the caret its old value back, so a render of this wrapper (the editor shows,
  // an error, busy) must not reach it. Its handlers read the latest state through refs.
  const changedRef = useRef((value: string) => {
    if (loaded.current === null || value === loaded.current) return
    markDirty()
  })
  changedRef.current = (value: string) => {
    if (loaded.current === null || value === loaded.current) return
    markDirty()
  }
  const surfaceEditor = useMemo(
    () => (
      <MDXEditor
        ref={editor}
        className="plan-editor-surface"
        contentEditableClassName="plan-document plan-ui plan-editor-content"
        markdown={markdown}
        plugins={plugins}
        lexicalTheme={planLexicalTheme}
        iconComponentFor={iconFor}
        onChange={(value) => changedRef.current(value)}
        onError={({ error }) => setMessage(`The editor could not read part of this block: ${error}`)}
      />
    ),
    [markdown, plugins],
  )

  const label = target.kind === 'cell' ? 'Edit cell' : target.kind === 'edit' ? 'Edit block' : 'New block'
  // The space the block keeps around it, so nothing moves when it opens. A new block holds a paragraph's height until its line is in.
  const place = margins ? { marginTop: margins.top, marginBottom: margins.bottom } : {}

  return (
    <div
      className="plan-editor plan-block-editor"
      data-plan-block-editor={target.kind}
      data-inline={inline ? '' : undefined}
      data-closing={closing ? '' : undefined}
      data-staged={staged ? '' : undefined}
      data-plan-edit-block={blockRange}
      // Kept on screen as it is until the page draws the edit, with nothing left to type into.
      inert={closing || undefined}
      ref={surface}
      role="group"
      aria-label={label}
      aria-busy={busy || undefined}
      style={{ ...place, minHeight: filled || staged ? undefined : height }}
    >
      {surfaceEditor}
      {/* The bar shows only when the edit cannot be kept as it is, so there is a way back. */}
      {message ? (
        <>
          <p className="host-error" role="alert">
            {message}
          </p>
          <div className="plan-block-editor-bar" role="toolbar" aria-label={label}>
            <span className="plan-editor-actions">
              <Button variant="secondary" onClick={() => onCancel()} disabled={busy} data-plan-block-cancel="">
                Cancel
              </Button>
              <Button variant="primary" onClick={onDone} disabled={busy} data-plan-block-done="">
                {busy ? 'Saving…' : 'Done'}
              </Button>
            </span>
          </div>
        </>
      ) : null}
    </div>
  )
}

/**
 * The block drawn right above (`-1`) or below (`1`) an editor that stands in for one, at its level:
 * a block of the plan or text in a card. The plan header's eyebrow and facts are not blocks, nor is
 * the block at `own`, which the page still draws while the editor opens over it.
 */
function blockBeside(editor: HTMLElement, direction: -1 | 1, own: string | null): HTMLElement | null {
  for (
    let next = direction < 0 ? editor.previousElementSibling : editor.nextElementSibling;
    next;
    next = direction < 0 ? next.previousElementSibling : next.nextElementSibling
  ) {
    if (!(next instanceof HTMLElement) || next.matches('[data-plan-head]')) continue
    if (own !== null && (next.dataset.planBlock ?? next.dataset.planText) === own) continue
    if (next.matches('[data-plan-block], [data-plan-text]')) return next
  }
  return null
}

/** True when the caret is before the first letter of `content`'s text. */
function caretAtStart(content: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return false
  const range = document.createRange()
  range.setStart(content, 0)
  try {
    range.setEnd(selection.anchorNode ?? content, selection.anchorOffset)
  } catch {
    return false
  }
  return range.toString().trim() === ''
}
