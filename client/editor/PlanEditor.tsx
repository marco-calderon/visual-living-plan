import {
  MDXEditor,
  codeBlockPlugin,
  headingsPlugin,
  jsxPlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  useCodeBlockEditorContext,
  type CodeBlockEditorDescriptor,
  type CodeBlockEditorProps,
  type MDXEditorMethods,
} from '@mdxeditor/editor'
import '@mdxeditor/editor/style.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { planSourceFromEditor, splitFrontmatter, toEditorMarkdown } from '../../src/planMdx/editSource.ts'
import { planNotReadyReason } from '../../src/planReady.ts'
import { Button } from '../ui/button.tsx'
import { clearDraft, throttle, writeDraft, type PlanDraft } from './draftStore.ts'
import { planJsxDescriptors } from './entryEditors.tsx'
import { useIsolatedFromEditor } from './isolate.ts'
import { slashMenuPlugin } from './slashMenu.tsx'
import './planEditor.css'

/** Fences (code, mermaid, the workflow table) are edited as plain text. */
function PlainCodeEditor({ code, language }: CodeBlockEditorProps) {
  const { setCode } = useCodeBlockEditorContext()
  const [value, setValue] = useState(code)
  const box = useRef<HTMLDivElement>(null)
  useIsolatedFromEditor(box)
  const rows = Math.min(24, Math.max(3, value.split('\n').length + 1))
  return (
    <div className="plan-editor-code" ref={box}>
      {language ? <span className="plan-editor-code-lang">{language}</span> : null}
      <textarea
        aria-label={language ? `${language} code` : 'Code'}
        spellCheck={false}
        rows={rows}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setCode(event.target.value)
        }}
      />
    </div>
  )
}

const plainCode: CodeBlockEditorDescriptor = { priority: 0, match: () => true, Editor: PlainCodeEditor }

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
    const edited = editor.current?.getMarkdown()
    if (edited === undefined) return null
    const next = planSourceFromEditor({ source: base, edited })
    return next.trimEnd() === base.trimEnd() ? null : next
  }, [base])

  // Keep the edit on this device, at most once a second while typing.
  const saver = useMemo(
    () =>
      throttle(() => {
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

  const plugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      linkPlugin(),
      tablePlugin(),
      codeBlockPlugin({ codeBlockEditorDescriptors: [plainCode] }),
      jsxPlugin({ jsxComponentDescriptors: planJsxDescriptors }),
      slashMenuPlugin(),
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
    <div className="plan-editor" data-plan-editor="">
      <div className="plan-editor-bar" role="toolbar" aria-label="Edit plan">
        <span className="plan-editor-status-text" role="status" data-plan-draft-state={state.kind}>
          {status}
          <span className="plan-editor-hint">
            Type <kbd>/</kbd> to add a card
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
        onChange={() => {
          setConfirmDiscard(false)
          setState((current) => (current.kind === 'failed' ? current : { kind: 'unsaved' }))
          saver.call()
        }}
        onError={({ error }) => setMessage(`The editor could not read part of this plan: ${error}`)}
      />
    </div>
  )
}
