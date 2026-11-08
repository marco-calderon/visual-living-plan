import { useCodeBlockEditorContext, type CodeBlockEditorDescriptor, type CodeBlockEditorProps } from '@mdxeditor/editor'
import { EditProvider, File, type EditorFactory, type FileContents } from '@pierre/diffs/react'
import { Editor } from '@pierre/diffs/edit'
import { bundledLanguages, bundledLanguagesAlias } from 'shiki/langs'
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import { appearance, useDiffsThemePair, useWrapCode } from '../CodeBlock.tsx'
import { renderMermaidSvg } from '../mdx/Mermaid.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx'

/** Languages the picker offers, by fence name. A fence with another name keeps it and shows it too. */
export const CODE_LANGUAGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'text', label: 'Plain text' },
  { value: 'mermaid', label: 'Mermaid' },
  { value: 'ts', label: 'TypeScript' },
  { value: 'tsx', label: 'TSX' },
  { value: 'js', label: 'JavaScript' },
  { value: 'jsx', label: 'JSX' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'java', label: 'Java' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'sql', label: 'SQL' },
  { value: 'yaml', label: 'YAML' },
  { value: 'toml', label: 'TOML' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'md', label: 'Markdown' },
  { value: 'diff', label: 'Diff' },
]

/** Fences the plan reads itself. Their language is what they are, so it is not offered for change. */
const FIXED_LANGUAGES = new Set(['workflow'])

/** The fence's language when the highlighter knows it, or plain text (as for `workflow`). */
export function highlightLanguage(lang: string): string {
  const id = lang.trim().toLowerCase()
  return id in bundledLanguages || id in bundledLanguagesAlias ? id : 'text'
}

type FenceEditor = Editor<'file', undefined, undefined>

/** Fences just added from the menu, by node key. Their editor takes the caret once it is drawn. */
const focusOnMount = new Set<string>()

export function focusFenceWhenReady(key: string): void {
  focusOnMount.add(key)
}

/** Put the caret at the end of the code. A click or a DOM focus alone leaves an empty document without one. */
function caretAtEnd(editor: FenceEditor): void {
  const lines = editor.getText().split('\n')
  editor.focus({ lineNumber: lines.length, character: lines.at(-1)?.length ?? 0 })
}

// A code editor takes every key, paste, and drop, not only those from inputs: Pierre types into its own
// contenteditable inside a shadow root, which the plan's editor would otherwise read as its own text.
const KEPT = ['keydown', 'keypress', 'keyup', 'beforeinput', 'input', 'paste', 'cut', 'copy', 'drop'] as const

function useOwnKeys(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const stop = (event: Event) => event.stopPropagation()
    for (const type of KEPT) node.addEventListener(type, stop)
    return () => {
      for (const type of KEPT) node.removeEventListener(type, stop)
    }
  }, [ref])
}

/** The mermaid figure for the code above it, drawn a moment after typing stops. */
function MermaidPreview({ source }: { source: string }) {
  const host = useRef<HTMLDivElement>(null)
  const prefix = `plan-editor-mermaid-${useId().replace(/[^A-Za-z0-9_-]+/g, '')}`
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => {
      const node = host.current
      if (!node) return
      const trimmed = source.trim()
      if (!trimmed) {
        node.replaceChildren()
        setError(null)
        return
      }
      try {
        node.innerHTML = renderMermaidSvg(trimmed, prefix)
        setError(null)
      } catch (failure) {
        // Keep the last good figure while the code is half typed.
        setError(failure instanceof Error ? failure.message : String(failure))
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [prefix, source])
  return (
    <figure className="plan-editor-mermaid" data-mermaid-preview="" aria-label="Mermaid preview">
      <div className="plan-editor-mermaid-figure" ref={host} />
      {error ? (
        <figcaption className="plan-editor-mermaid-error" role="status">
          {error}
        </figcaption>
      ) : null}
    </figure>
  )
}

/**
 * A fence, edited in Pierre's code editor with the page's syntax theme. The language picker
 * changes the fence's language, and a mermaid fence draws its figure below the code.
 */
function CodeFenceEditor({ code, language }: CodeBlockEditorProps) {
  const { setCode, setLanguage, lexicalNode } = useCodeBlockEditorContext()
  const [text, setText] = useState(code)
  const latest = useRef(code)
  const box = useRef<HTMLDivElement>(null)
  useOwnKeys(box)
  const pierre = useRef<FenceEditor | null>(null)
  const createEditor = useMemo<EditorFactory<undefined, undefined>>(
    () => (type, options, key) => {
      const editor = new Editor(type, options, key)
      if (type === 'file') pierre.current = editor as unknown as FenceEditor
      return editor
    },
    [],
  )

  // Pierre attaches its editor a frame or two after mount.
  useEffect(() => {
    const key = lexicalNode.getKey()
    if (!focusOnMount.has(key)) return
    focusOnMount.delete(key)
    let frame = 0
    let tries = 0
    const attempt = () => {
      const editor = pierre.current
      if (editor?.getFile()) caretAtEnd(editor)
      else if (tries++ < 60) frame = requestAnimationFrame(attempt)
    }
    frame = requestAnimationFrame(attempt)
    return () => cancelAnimationFrame(frame)
  }, [lexicalNode])
  const theme = useDiffsThemePair()
  const wrap = useWrapCode()
  const lang = language.trim()
  const fixed = FIXED_LANGUAGES.has(lang)
  const known = CODE_LANGUAGES.some((option) => option.value === lang)
  const options = known || !lang ? CODE_LANGUAGES : [...CODE_LANGUAGES, { value: lang, label: lang }]

  // The editor owns the text while it is open. A new language starts it again from the latest text.
  const file = useMemo<FileContents>(
    () => ({ name: 'fence', contents: latest.current, lang: highlightLanguage(lang) as FileContents['lang'] }),
    [lang],
  )
  const fileOptions = useMemo(() => ({ ...appearance(wrap), theme, disableFileHeader: true }), [theme, wrap])

  return (
    <div className="plan-editor-code" ref={box} data-code-fence={lang || 'text'}>
      <div className="plan-editor-code-head">
        {fixed ? (
          <span className="plan-editor-code-lang">{lang}</span>
        ) : (
          <Select value={lang || 'text'} onValueChange={(next) => setLanguage(String(next ?? '') === 'text' ? '' : String(next ?? ''))}>
            <SelectTrigger className="plan-editor-select plan-editor-code-select" aria-label="Code language">
              <SelectValue>{(value: string) => options.find((option) => option.value === value)?.label ?? value}</SelectValue>
            </SelectTrigger>
            <SelectContent className="plan-editor-select-popup">
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div
        className="plan-editor-code-body"
        onPointerUp={() => {
          const editor = pierre.current
          if (editor?.getFile() && editor.getText() === '') caretAtEnd(editor)
        }}
      >
        <EditProvider createEditor={createEditor}>
          <File
            file={file}
            options={fileOptions}
            edit
            disableWorkerPool
            className="plan-code plan-editor-code-file"
            onEditChange={(event) => {
              const next = event.file.contents
              latest.current = next
              setText(next)
              setCode(next)
            }}
          />
        </EditProvider>
      </div>
      {lang === 'mermaid' ? <MermaidPreview source={text} /> : null}
    </div>
  )
}

export const codeFenceEditor: CodeBlockEditorDescriptor = { priority: 0, match: () => true, Editor: CodeFenceEditor }
