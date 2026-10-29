import { useEffect, useMemo, useState } from 'react'
import { File, PatchDiff, type FileContents } from '@pierre/diffs/react'
import { DEFAULT_DIFFS_THEME, diffsThemePair } from '../src/diffsTheme'

type DiffsThemePair = { light: string; dark: string }

function readDiffsThemePair(): DiffsThemePair {
  return diffsThemePair(document.documentElement.dataset.diffsTheme ?? DEFAULT_DIFFS_THEME)
}

function useDiffsThemePair(): DiffsThemePair {
  const [pair, setPair] = useState<DiffsThemePair>(readDiffsThemePair)

  useEffect(() => {
    const sync = (event?: Event) => {
      const detail = (event as CustomEvent<{ diffsTheme?: string }> | undefined)?.detail
      const id = detail?.diffsTheme ?? document.documentElement.dataset.diffsTheme ?? DEFAULT_DIFFS_THEME
      const next = diffsThemePair(id)
      setPair((previous) =>
        previous.light === next.light && previous.dark === next.dark ? previous : next,
      )
    }
    window.addEventListener('living-plan-theme', sync)
    return () => window.removeEventListener('living-plan-theme', sync)
  }, [])

  return pair
}

function readWrapCode(): boolean {
  return document.documentElement.dataset.wrapCode === 'true'
}

function useWrapCode(): boolean {
  const [wrap, setWrap] = useState(readWrapCode)

  useEffect(() => {
    const sync = (event?: Event) => {
      const detail = (event as CustomEvent<{ wrapCode?: boolean }> | undefined)?.detail
      const next = typeof detail?.wrapCode === 'boolean' ? detail.wrapCode : readWrapCode()
      setWrap((previous) => (previous === next ? previous : next))
    }
    window.addEventListener('living-plan-theme', sync)
    return () => window.removeEventListener('living-plan-theme', sync)
  }, [])

  return wrap
}

function appearance(wrap: boolean) {
  return {
    themeType: 'system' as const,
    preferredHighlighter: 'shiki-js' as const,
    overflow: wrap ? ('wrap' as const) : ('scroll' as const),
    unsafeCSS: `
    :host {
      --diffs-font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --diffs-font-size: 13.5px;
      --diffs-line-height: 22px;
    }
  `,
  }
}

export type CodeBlockProps = {
  code: string
  language: string
  startingLineNumber?: number
  diff?: boolean
}

function patchText(code: string, language: string): string {
  let body = code.endsWith('\n') ? code : `${code}\n`
  if (!/^diff --git /m.test(body) && !/^---[ \t]+\S/m.test(body)) {
    const name = language ? `snippet.${language}` : 'snippet'
    body = `--- a/${name}\n+++ b/${name}\n${body}`
  }
  if (/^diff --git /m.test(body)) return body
  return body.replace(/^---[ \t]+(\S+)\n\+\+\+[ \t]+(\S+)/gm, (full, oldPath: string, newPath: string) => {
    const oldName = oldPath.replace(/^[ab]\//, '')
    const newName = newPath.replace(/^[ab]\//, '')
    const left = oldName === '/dev/null' ? newName : oldName
    const right = newName === '/dev/null' ? oldName : newName
    return `diff --git a/${left} b/${right}\n${full}`
  })
}

function renumber(node: HTMLElement, start: number): void {
  const root = node.shadowRoot ?? node
  for (const gutter of root.querySelectorAll<HTMLElement>('[data-line-index]')) {
    const index = Number(gutter.getAttribute('data-line-index'))
    const label = gutter.querySelector('[data-line-number-content]')
    if (!label || !Number.isInteger(index)) continue
    label.textContent = String(index + start)
  }
}

export function CodeBlock({ code, language, startingLineNumber, diff = false }: CodeBlockProps) {
  const named = language.trim()
  const theme = useDiffsThemePair()
  const wrap = useWrapCode()
  const file = useMemo<FileContents>(
    () => ({
      name: named ? `snippet.${named}` : 'snippet',
      contents: code,
      lang: named || 'text',
    }),
    [code, named],
  )
  const patch = useMemo(() => patchText(code, named), [code, named])
  const fileOptions = useMemo(
    () => ({
      ...appearance(wrap),
      theme,
      disableFileHeader: true,
      onPostRender:
        startingLineNumber && startingLineNumber > 1
          ? (node: HTMLElement) => {
              renumber(node, startingLineNumber)
            }
          : undefined,
    }),
    [startingLineNumber, theme, wrap],
  )
  const diffOptions = useMemo(
    () => ({
      ...appearance(wrap),
      theme,
      disableFileHeader: false,
      diffStyle: 'unified' as const,
      diffIndicators: 'bars' as const,
      hunkSeparators: 'line-info' as const,
    }),
    [theme, wrap],
  )

  if (diff) {
    return <PatchDiff patch={patch} options={diffOptions} disableWorkerPool className="plan-code" />
  }

  return <File file={file} options={fileOptions} disableWorkerPool className="plan-code" />
}
