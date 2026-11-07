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
import { useMemo, useRef, useState } from 'react'
import { planSourceFromEditor, splitFrontmatter, toEditorMarkdown } from '../../src/planMdx/editSource.ts'
import { Button } from '../ui/button.tsx'
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

export type PlanEditorProps = {
  /** The plan file as it was when editing started. */
  source: string
  /** True when the plan on the server changed since editing started. */
  outdated: boolean
  save: (next: string) => Promise<{ ok: true } | { ok: false; message: string }>
  onClose: () => void
}

export function PlanEditor({ source, outdated, save, onClose }: PlanEditorProps) {
  const editor = useRef<MDXEditorMethods>(null)
  const markdown = useMemo(() => toEditorMarkdown(splitFrontmatter(source).body), [source])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

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

  async function onSave() {
    const edited = editor.current?.getMarkdown()
    if (edited === undefined) return
    setSaving(true)
    setMessage(null)
    try {
      const next = planSourceFromEditor({ source, edited })
      const result = await save(next)
      if (result.ok) onClose()
      else setMessage(result.message)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the plan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="plan-editor" data-plan-editor="">
      <div className="plan-editor-bar" role="toolbar" aria-label="Edit plan">
        <span className="plan-editor-hint">
          Type <kbd>/</kbd> to add a card
        </span>
        <span className="plan-editor-actions">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void onSave()} disabled={saving || !dirty} data-plan-editor-save="">
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </span>
      </div>
      {outdated ? (
        <p className="lock-banner" role="status">
          The agent changed this plan while you were editing. Saving will be refused. Cancel to see the new version.
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
        onChange={() => setDirty(true)}
        onError={({ error }) => setMessage(`The editor could not read part of this plan: ${error}`)}
      />
    </div>
  )
}
