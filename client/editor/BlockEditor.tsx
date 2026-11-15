import { MDXEditor, type MDXEditorMethods } from '@mdxeditor/editor'
import {
  $createRangeSelectionFromDom,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  getNearestEditorFromDOMNode,
} from 'lexical'
import '@mdxeditor/editor/style.css'
import { $isHeadingNode } from '@lexical/rich-text'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { applyBlockEdit, applyCellEdit, blockEditorText, cellEditorText, samePlanSource, type BlockRange } from '../../src/planMdx/blockEdit.ts'
import { remapBlockStart } from '../../src/planMdx/remarkBlockRanges.ts'
import { planNotReadyReason } from '../../src/planReady.ts'
import { placeCaret } from '../caretSpot.ts'
import { isTap, isTouchPointer } from '../pointerKind.ts'
import type { EditCaret, EditFollow } from '../planEditButton.ts'
import { Button } from '../ui/button.tsx'
import { releaseOuterCarets, syncFocusedNestedEditor } from './blockHandles.tsx'
import { iconFor, planEditorPlugins, useKeepTypingInView } from './editorSetup.tsx'
import './planEditor.css'

/**
 * What the editor changes: one block of the plan, a new block after one (after the last when null),
 * or the text of one pipe table cell. Text opens `inline`: it keeps its look and place on the page.
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
}

/**
 * Menus and dialogs the editor opens outside its own box. A click in one is still editing. So is a
 * press on the bar of unapplied changes: Apply finishes the edit itself, and Discard drops it.
 */
const EDITOR_POPUPS =
  '.plan-slash-menu, .plan-block-handles, .plan-block-menu, .plan-insert-prompt, .mdxeditor-popup-container, [role="dialog"], [role="listbox"], [role="menu"], [data-plan-apply-bar]'

function insideEditor(surface: HTMLElement, target: EventTarget | null): boolean {
  return target instanceof Node && (surface.contains(target) || (target instanceof Element && target.closest(EDITOR_POPUPS) !== null))
}

/**
 * The editor adds an empty line after a heading, a list, or a quote, to type below it. Text edited
 * as it reads keeps no such line unless the caret is on it (Enter at the end made it), so the
 * blocks under the text stay where they were. Returns the cleanup.
 */
function keepNoTrailingLine(content: HTMLElement): () => void {
  const editor = getNearestEditorFromDOMNode(content)
  if (!editor) return () => undefined
  const drop = () => {
    const extra = editor.getEditorState().read(() => {
      const root = $getRoot()
      const last = root.getLastChild()
      if (root.getChildrenSize() < 2 || !$isParagraphNode(last) || last.getChildrenSize() > 0) return false
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

/** Put the caret where the click landed: in the text, or in a data table's cell. Cells appear a frame or two after the table. */
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
    if (!placeCaret(content, caret.offset)) return
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
 * One block of the plan, open for editing where it sits on the page (ADR 0040). Done keeps the edit
 * on this device and shows it on the page; nothing reaches the plan until Apply changes.
 */
export function BlockEditor({ source, target, commit, onCancel, caret, margins, height, closing = false, registerDone, blockRange }: BlockEditorProps) {
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
  const [confirmRemove, setConfirmRemove] = useState(false)
  const loaded = useRef<string | null>(null)
  const [dirty, setDirty] = useState(false)
  // The editor draws its text a frame or two after it mounts. Until then it holds the text's height.
  const [filled, setFilled] = useState(height === undefined)
  useEffect(() => {
    if (filled) return
    let frame = 0
    let left = 12
    const check = () => {
      const content = surface.current?.querySelector('.plan-editor-content')
      if ((content && content.childElementCount > 0) || left <= 0) {
        setFilled(true)
        return
      }
      left -= 1
      frame = requestAnimationFrame(check)
    }
    frame = requestAnimationFrame(check)
    return () => cancelAnimationFrame(frame)
  }, [filled])

  useKeepTypingInView(surface)

  // The caret goes into the block, where the click on it landed, so typing can start right away. A new block shows the `/` hint.
  useEffect(() => {
    let stopTrailing = () => {}
    let stopped = false
    const frame = requestAnimationFrame(() => {
      const node = surface.current
      loaded.current = editor.current?.getMarkdown() ?? null
      // Inline text with no click to follow (E) puts the caret at the end of its text.
      const at = caret ?? (inline ? { offset: Number.MAX_SAFE_INTEGER } : undefined)
      const opened = () => {
        if (!node) return
        const content = node.querySelector<HTMLElement>('.plan-editor-content')
        if (inline && content && !stopped) stopTrailing = keepNoTrailingLine(content)
        if (at) placeOpeningCaret(node, at)
      }
      editor.current?.focus(opened, {
        defaultSelection: 'rootEnd',
        preventScroll: true,
      })
    })
    return () => {
      cancelAnimationFrame(frame)
      stopped = true
      stopTrailing()
    }
    // Once, when the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const node = surface.current
    if (!node) return
    const changed = () => {
      setConfirmRemove(false)
      setDirty(true)
    }
    const focused = (event: FocusEvent) => releaseOuterCarets(event.target)
    node.addEventListener('input', changed)
    node.addEventListener('focusin', focused)
    return () => {
      node.removeEventListener('input', changed)
      node.removeEventListener('focusin', focused)
    }
  }, [])

  // Typing that is not Done yet lives only in this editor. Leaving the page asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

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
    // The blocks beside this one, as the page draws them now.
    const above = blockBeside(node, -1)
    const below = above ? null : blockBeside(node, 1)
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

  // Inline text has no Done button: a click or a Tab out of it is Done. Menus it opens are still part of it.
  useEffect(() => {
    const node = surface.current
    if (!inline || !node || closing) return
    const outside = (event: MouseEvent) => {
      if (insideEditor(node, event.target)) return false
      // The window's scrollbar is not the page.
      return !(event.target === document.documentElement && event.clientX >= document.documentElement.clientWidth)
    }
    // A mouse finishes at the press. A finger finishes at a tap: its press may start a scroll.
    const onPointerDown = (event: PointerEvent) => {
      if (!isTouchPointer(event) && outside(event)) doneRef.current()
    }
    const onTap = (event: MouseEvent) => {
      if (isTap(event) && outside(event)) doneRef.current()
    }
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget
      if (next === null || insideEditor(node, next)) return
      doneRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('click', onTap, true)
    node.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('click', onTap, true)
      node.removeEventListener('focusout', onFocusOut)
    }
  }, [inline, closing])

  function onRemove() {
    if (!confirmRemove) {
      setConfirmRemove(true)
      return
    }
    void finish('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Escape closes menus first. With nothing typed, it also closes the editor; inline text keeps what was typed.
    if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('.plan-slash-menu')) {
      if (!dirty) {
        event.preventDefault()
        onCancel()
      } else if (inline) {
        event.preventDefault()
        onDone()
      }
    }
  }

  const label = target.kind === 'cell' ? 'Edit cell' : target.kind === 'edit' ? 'Edit block' : 'New block'

  return (
    <div
      className="plan-editor plan-block-editor"
      data-plan-block-editor={target.kind}
      data-inline={inline ? '' : undefined}
      data-closing={closing ? '' : undefined}
      data-plan-edit-block={blockRange}
      // Kept on screen as it is until the page draws the edit, with nothing left to type into.
      inert={closing || undefined}
      ref={surface}
      role="group"
      aria-label={label}
      aria-busy={busy || undefined}
      onKeyDown={onKeyDown}
      style={
        inline && margins
          ? { marginTop: margins.top, marginBottom: margins.bottom, minHeight: filled ? undefined : height }
          : undefined
      }
    >
      <MDXEditor
        ref={editor}
        className="plan-editor-surface"
        contentEditableClassName="plan-document plan-ui plan-editor-content"
        markdown={markdown}
        plugins={plugins}
        iconComponentFor={iconFor}
        onChange={(value) => {
          if (loaded.current === null || value === loaded.current) return
          setConfirmRemove(false)
          setDirty(true)
        }}
        onError={({ error }) => setMessage(`The editor could not read part of this block: ${error}`)}
      />
      {message ? (
        <p className="host-error" role="alert">
          {message}
        </p>
      ) : null}
      {/* Inline text shows its bar only when the edit cannot be kept as it is, so there is a way back. */}
      {inline && !message ? null : (
      <div className="plan-block-editor-bar" role="toolbar" aria-label={label}>
        <span className="plan-block-editor-hint">
          <kbd>/</kbd> adds a block · <kbd>{isMac() ? '⌘' : 'Ctrl'}</kbd>
          <kbd>↵</kbd> Done
        </span>
        <span className="plan-editor-actions">
          {target.kind === 'edit' && !inline ? (
            <Button variant="ghost" className="plan-block-editor-remove" onClick={onRemove} disabled={busy} data-plan-block-remove="">
              {confirmRemove ? 'Remove this block?' : 'Remove'}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => onCancel()} disabled={busy} data-plan-block-cancel="">
            Cancel
          </Button>
          <Button variant="primary" onClick={onDone} disabled={busy} data-plan-block-done="">
            {busy ? 'Saving…' : 'Done'}
          </Button>
        </span>
      </div>
      )}
    </div>
  )
}

/**
 * The block drawn right above (`-1`) or below (`1`) an editor that stands in for one, at its level:
 * a block of the plan or text in a card. The plan header's eyebrow and facts are not blocks.
 */
function blockBeside(editor: HTMLElement, direction: -1 | 1): HTMLElement | null {
  for (
    let next = direction < 0 ? editor.previousElementSibling : editor.nextElementSibling;
    next;
    next = direction < 0 ? next.previousElementSibling : next.nextElementSibling
  ) {
    if (!(next instanceof HTMLElement) || next.matches('[data-plan-head]')) continue
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

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}
