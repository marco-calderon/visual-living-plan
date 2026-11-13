import { MDXEditor, type MDXEditorMethods } from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { applyBlockEdit, blockEditorText, samePlanSource, type BlockRange } from '../../src/planMdx/blockEdit.ts'
import { planNotReadyReason } from '../../src/planReady.ts'
import { Button } from '../ui/button.tsx'
import { releaseOuterCarets, syncFocusedNestedEditor } from './blockHandles.tsx'
import { iconFor, planEditorPlugins, useKeepTypingInView } from './editorSetup.tsx'
import './planEditor.css'

/** What the editor changes: one block of the plan, or a new block after one (after the last when null). */
export type BlockTarget = { kind: 'edit'; range: BlockRange } | { kind: 'add'; after: BlockRange | null }

export type BlockEditorProps = {
  /** The plan file the page shows. The block's range is a place in it. */
  source: string
  target: BlockTarget
  /** Keep the plan file with this edit as an unapplied change. Resolves to an error to show, or null. */
  commit: (next: string) => Promise<string | null>
  /** Close without a change. */
  onCancel: () => void
}

/**
 * One block of the plan, open for editing where it sits on the page (ADR 0040). Done keeps the edit
 * on this device and shows it on the page; nothing reaches the plan until Apply changes.
 */
export function BlockEditor({ source, target, commit, onCancel }: BlockEditorProps) {
  const editor = useRef<MDXEditorMethods>(null)
  const surface = useRef<HTMLDivElement>(null)
  // Read once: the page keeps showing this source while the editor is open.
  const [markdown] = useState(() => (target.kind === 'edit' ? blockEditorText(source, target.range) : ''))
  const plugins = useMemo(planEditorPlugins, [])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const loaded = useRef<string | null>(null)
  const [dirty, setDirty] = useState(false)

  useKeepTypingInView(surface)

  // The caret goes into the block, so typing can start right away. A new block shows the `/` hint.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      loaded.current = editor.current?.getMarkdown() ?? null
      editor.current?.focus(undefined, { defaultSelection: 'rootEnd', preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
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
        target.kind === 'edit'
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

  function onDone() {
    syncFocusedNestedEditor()
    const edited = editor.current?.getMarkdown()
    if (edited === undefined) return
    if (loaded.current !== null && edited === loaded.current && target.kind === 'edit') {
      onCancel()
      return
    }
    void finish(edited)
  }

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
    // Escape closes menus first. With nothing typed, it also closes the editor.
    if (event.key === 'Escape' && !dirty && !event.defaultPrevented && !document.querySelector('.plan-slash-menu')) {
      event.preventDefault()
      onCancel()
    }
  }

  const label = target.kind === 'edit' ? 'Edit block' : 'New block'

  return (
    <div
      className="plan-editor plan-block-editor"
      data-plan-block-editor={target.kind}
      ref={surface}
      role="group"
      aria-label={label}
      aria-busy={busy || undefined}
      onKeyDown={onKeyDown}
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
      <div className="plan-block-editor-bar" role="toolbar" aria-label={label}>
        <span className="plan-block-editor-hint">
          <kbd>/</kbd> adds a block · <kbd>{isMac() ? '⌘' : 'Ctrl'}</kbd>
          <kbd>↵</kbd> Done
        </span>
        <span className="plan-editor-actions">
          {target.kind === 'edit' ? (
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
    </div>
  )
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}
