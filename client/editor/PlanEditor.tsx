import {
  MDXEditor,
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
  type MDXEditorMethods,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type RefObject } from 'react'
import { planSourceFromEditor, splitFrontmatter, toEditorMarkdown } from '../../src/planMdx/editSource.ts'
import { planNotReadyReason } from '../../src/planReady.ts'
import { Button } from '../ui/button.tsx'
import { clearDraft, throttle, writeDraft, type PlanDraft } from './draftStore.ts'
import { planJsxDescriptors } from './entryEditors.tsx'
import { slashMenuPlugin } from './slashMenu.tsx'
import { lockedCardsPlugin } from './lockedPlugin.tsx'
import { codeFenceEditor } from './codeFence.tsx'
import { blockHandlesPlugin, releaseOuterCarets, syncFocusedNestedEditor } from './blockHandles.tsx'
import './planEditor.css'

/** A table's add-row and add-column bars use the same + as the bar that adds a block. */
function iconFor(name: IconKey): ReactElement {
  if (name === 'add_row' || name === 'add_column') return <Plus size={12} strokeWidth={2.25} aria-hidden="true" />
  return defaultSvgIcons[name]
}


/**
 * A keystroke never needs to move the page so far that the field being typed in leaves the screen.
 * Some browsers do that when the editor updates around a focused field; put the page back.
 */
function useKeepTypingInView(surface: RefObject<HTMLElement | null>): void {
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

export type PublishResult = { ok: true } | { ok: false; message: string }

export type PlanEditorProps = {
  planId: string
  /** The plan file the edit started from: the live plan, or the base of a restored draft. */
  base: string
  /** An unpublished edit kept on this device, to continue from. */
  draft: PlanDraft | null
  /** True when the live plan is no longer `base`. Publishing would be refused. */
  outdated: boolean
  publish: (next: string) => Promise<PublishResult>
  /** Close the editor. The draft stays on this device. */
  onClose: () => void
}

const DRAFT_SAVE_MS = 1000

function timeOf(at: number): string {
  try {
    return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

type DraftState = { kind: 'clean' } | { kind: 'saved'; at: number } | { kind: 'unsaved' } | { kind: 'failed' }

export function PlanEditor({ planId, base, draft, outdated, publish, onClose }: PlanEditorProps) {
  const editor = useRef<MDXEditorMethods>(null)
  const markdown = useMemo(() => draft?.markdown ?? toEditorMarkdown(splitFrontmatter(base).body), [base, draft])
  const online = useOnline()
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [state, setState] = useState<DraftState>(draft ? { kind: 'saved', at: draft.savedAt } : { kind: 'clean' })

  // The plan file this edit would publish, or null when it is the same as the base.
  const nextSource = useCallback((): string | null => {
    syncFocusedNestedEditor()
    const edited = editor.current?.getMarkdown()
    if (edited === undefined) return null
    const next = planSourceFromEditor({ source: base, edited })
    return next.trimEnd() === base.trimEnd() ? null : next
  }, [base])

  // Keep the edit on this device, at most once a second while typing.
  const saver = useMemo(
    () =>
      throttle(() => {
        syncFocusedNestedEditor()
        const edited = editor.current?.getMarkdown()
        if (edited === undefined) return
        let changed = true
        try {
          changed = nextSource() !== null
        } catch {
          // A half-typed card does not parse yet. Keep the text anyway.
        }
        if (!changed) {
          clearDraft(planId)
          setState({ kind: 'clean' })
          return
        }
        const at = Date.now()
        setState(writeDraft(planId, { base, markdown: edited, savedAt: at }) ? { kind: 'saved', at } : { kind: 'failed' })
      }, DRAFT_SAVE_MS),
    [base, nextSource, planId],
  )

  useEffect(() => {
    const flush = () => saver.flush()
    const hidden = () => {
      if (document.visibilityState === 'hidden') saver.flush()
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', hidden)
      saver.flush()
    }
  }, [saver])

  const surface = useRef<HTMLDivElement>(null)

  // Typing in a card body changes that card's own editor, which the plan hears about later.
  // Any input inside the editor counts as a change to keep.
  useEffect(() => {
    const node = surface.current
    if (!node) return
    const changed = () => {
      setConfirmDiscard(false)
      setState((current) => (current.kind === 'unsaved' || current.kind === 'failed' ? current : { kind: 'unsaved' }))
      saver.call()
    }
    const focused = (event: FocusEvent) => releaseOuterCarets(event.target)
    node.addEventListener('input', changed)
    node.addEventListener('focusin', focused)
    return () => {
      node.removeEventListener('input', changed)
      node.removeEventListener('focusin', focused)
    }
  }, [saver])

  useKeepTypingInView(surface)

  const plugins = useMemo(
    () => [
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
      slashMenuPlugin(),
      lockedCardsPlugin(),
      blockHandlesPlugin(),
      markdownShortcutPlugin(),
    ],
    [],
  )

  async function onPublish() {
    saver.flush()
    setMessage(null)
    let next: string | null
    try {
      next = nextSource()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'This edit cannot be read as a plan yet.')
      return
    }
    if (next === null) {
      setMessage('There are no changes to publish.')
      return
    }
    setPublishing(true)
    try {
      const reason = await planNotReadyReason(next)
      if (reason) {
        setMessage(`This edit does not render yet, so it was not published. ${reason}`)
        return
      }
      const result = await publish(next)
      if (!result.ok) {
        setMessage(result.message)
        return
      }
      saver.cancel()
      clearDraft(planId)
      onClose()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not publish the plan')
    } finally {
      setPublishing(false)
    }
  }

  function onDiscard() {
    if (!confirmDiscard) {
      setConfirmDiscard(true)
      return
    }
    saver.cancel()
    clearDraft(planId)
    onClose()
  }

  const status =
    state.kind === 'saved'
      ? `Draft saved on this device · ${timeOf(state.at)}`
      : state.kind === 'unsaved'
        ? 'Saving draft…'
        : state.kind === 'failed'
          ? 'This browser did not keep the draft. Publish before you close the page.'
          : 'No changes yet'
  const hasChanges = state.kind !== 'clean'

  return (
    <div className="plan-editor" data-plan-editor="" ref={surface}>
      <div className="plan-editor-bar" role="toolbar" aria-label="Edit plan">
        <span className="plan-editor-status-text" role="status" data-plan-draft-state={state.kind}>
          {status}
          <span className="plan-editor-hint">
            Type <kbd>/</kbd> to add a block
          </span>
        </span>
        <span className="plan-editor-actions">
          {hasChanges ? (
            <Button variant="ghost" onClick={onDiscard} disabled={publishing} data-plan-editor-discard="">
              {confirmDiscard ? 'Discard changes?' : 'Discard'}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose} disabled={publishing} data-plan-editor-close="">
            Close
          </Button>
          <Button
            variant="primary"
            onClick={() => void onPublish()}
            disabled={publishing || !hasChanges || !online}
            title={online ? 'Publish a new version of the plan' : 'Publishing needs a connection. The draft stays on this device.'}
            data-plan-editor-publish=""
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </Button>
        </span>
      </div>
      {!online ? (
        <p className="lock-banner" role="status">
          You are offline. Keep editing: the draft is saved on this device. Publish when you are back online.
        </p>
      ) : null}
      {outdated ? (
        <p className="lock-banner" role="status" data-plan-editor-outdated="">
          The plan changed after this edit started, so publishing will be refused. Discard to start again from the new version.
        </p>
      ) : null}
      {message ? (
        <p className="host-error" role="alert">
          {message}
        </p>
      ) : null}
      <MDXEditor
        ref={editor}
        className="plan-editor-surface"
        contentEditableClassName="plan-document plan-ui plan-editor-content"
        markdown={markdown}
        plugins={plugins}
        iconComponentFor={iconFor}
        onChange={() => {
          setConfirmDiscard(false)
          setState((current) => (current.kind === 'unsaved' || current.kind === 'failed' ? current : { kind: 'unsaved' }))
          saver.call()
        }}
        onError={({ error }) => setMessage(`The editor could not read part of this plan: ${error}`)}
      />
    </div>
  )
}
