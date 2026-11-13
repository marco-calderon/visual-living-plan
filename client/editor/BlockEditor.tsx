import { MDXEditor, type MDXEditorMethods } from '@mdxeditor/editor'
import { $getRoot, $isParagraphNode, getNearestEditorFromDOMNode } from 'lexical'
import '@mdxeditor/editor/style.css'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { applyBlockEdit, applyCellEdit, blockEditorText, cellEditorText, samePlanSource, type BlockRange } from '../../src/planMdx/blockEdit.ts'
import { planNotReadyReason } from '../../src/planReady.ts'
import { placeCaret } from '../caretSpot.ts'
import type { EditCaret } from '../planEditButton.ts'
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
  | { kind: 'add'; after: BlockRange | null }
  | { kind: 'cell'; range: BlockRange }

export type BlockEditorProps = {
  /** The plan file the page shows. The block's range is a place in it. */
  source: string
  target: BlockTarget
  /** Keep the plan file with this edit as an unapplied change. Resolves to an error to show, or null. */
  commit: (next: string) => Promise<string | null>
  /** Close without a change. */
  onCancel: () => void
  /** Where the caret goes: where the click on the block landed. At the end when not given. */
  caret?: EditCaret
  /** The margins of the block it stands in for, so inline text does not move. */
  margins?: { top: string; bottom: string }
}

/** Menus and dialogs the editor opens outside its own box. A click in one is still editing. */
const EDITOR_POPUPS =
  '.plan-slash-menu, .plan-block-handles, .plan-block-menu, .plan-insert-prompt, .mdxeditor-popup-container, [role="dialog"], [role="listbox"], [role="menu"]'

function insideEditor(surface: HTMLElement, target: EventTarget | null): boolean {
  return target instanceof Node && (surface.contains(target) || (target instanceof Element && target.closest(EDITOR_POPUPS) !== null))
}

/**
 * The editor keeps an empty line after a heading, a list, or a quote, to type below it. Text edited
 * as it reads opens without it, so the blocks under it stay where they were.
 */
function dropTrailingLine(content: HTMLElement): void {
  const editor = getNearestEditorFromDOMNode(content)
  editor?.update(
    () => {
      const root = $getRoot()
      const last = root.getLastChild()
      if (root.getChildrenSize() > 1 && $isParagraphNode(last) && last.getChildrenSize() === 0) last.remove()
    },
    { discrete: true },
  )
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
    placeCaret(content, caret.offset)
  }
  attempt(frames)
}

/**
 * One block of the plan, open for editing where it sits on the page (ADR 0040). Done keeps the edit
 * on this device and shows it on the page; nothing reaches the plan until Apply changes.
 */
export function BlockEditor({ source, target, commit, onCancel, caret, margins }: BlockEditorProps) {
  const editor = useRef<MDXEditorMethods>(null)
  const surface = useRef<HTMLDivElement>(null)
  // Text and table cells are edited as they read: no frame, no bar, and a click elsewhere is Done.
  const inline = target.kind === 'cell' || (target.kind === 'edit' && target.inline === true)
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

  useKeepTypingInView(surface)

  // The caret goes into the block, where the click on it landed, so typing can start right away. A new block shows the `/` hint.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const node = surface.current
      // Before the caret goes in: the editor would move it off the line it drops.
      const content = node?.querySelector<HTMLElement>('.plan-editor-content')
      if (inline && content) dropTrailingLine(content)
      loaded.current = editor.current?.getMarkdown() ?? null
      // Inline text with no click to follow (E) puts the caret at the end of its text.
      const at = caret ?? (inline ? { offset: Number.MAX_SAFE_INTEGER } : undefined)
      editor.current?.focus(at && node ? () => placeOpeningCaret(node, at) : undefined, {
        defaultSelection: 'rootEnd',
        preventScroll: true,
      })
    })
    return () => cancelAnimationFrame(frame)
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

  async function finish(edited: string) {
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
      onCancel()
      return
    }
    setBusy(true)
    try {
      const reason = await planNotReadyReason(next)
      if (reason) {
        setMessage(`This block does not render yet. ${reason}`)
        return
      }
      const error = await commit(next)
      if (error) setMessage(error)
      // Otherwise the page closes this editor once it shows the new block.
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not keep this change')
    } finally {
      setBusy(false)
    }
  }

  const finishing = useRef(false)
  function onDone() {
    if (finishing.current) return
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

  // Inline text has no Done button: a click or a Tab out of it is Done. Menus it opens are still part of it.
  useEffect(() => {
    const node = surface.current
    if (!inline || !node) return
    const onPointerDown = (event: PointerEvent) => {
      if (insideEditor(node, event.target)) return
      // The window's scrollbar is not the page.
      if (event.target === document.documentElement && event.clientX >= document.documentElement.clientWidth) return
      doneRef.current()
    }
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget
      if (next === null || insideEditor(node, next)) return
      doneRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    node.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      node.removeEventListener('focusout', onFocusOut)
    }
  }, [inline])

  function onRemove() {
    if (!confirmRemove) {
      setConfirmRemove(true)
      return
    }
    void finish('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      onDone()
      return
    }
    // A cell is one line: Enter is Done, as in a spreadsheet.
    if (event.key === 'Enter' && target.kind === 'cell' && !event.shiftKey && !document.querySelector('.plan-slash-menu')) {
      event.preventDefault()
      event.stopPropagation()
      onDone()
      return
    }
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
      ref={surface}
      role="group"
      aria-label={label}
      aria-busy={busy || undefined}
      onKeyDown={onKeyDown}
      style={inline && margins ? { marginTop: margins.top, marginBottom: margins.bottom } : undefined}
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
          <Button variant="secondary" onClick={onCancel} disabled={busy} data-plan-block-cancel="">
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

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}
