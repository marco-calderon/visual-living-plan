import { useEffect, useMemo, useState } from 'react'
import { File, PatchDiff, type FileContents } from '@pierre/diffs/react'
import { codeForDisplay, patchText } from './codeForDisplay'
import { DEFAULT_DIFFS_THEME, diffsThemePair } from '../src/diffsTheme'

type DiffsThemePair = { light: string; dark: string }

function readDiffsThemePair(): DiffsThemePair {
  return diffsThemePair(document.documentElement.dataset.diffsTheme ?? DEFAULT_DIFFS_THEME)
}

/** The page's code theme pair, following Settings. */
export function useDiffsThemePair(): DiffsThemePair {
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

/** Whether Settings wraps long code lines. */
export function useWrapCode(): boolean {
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

type ThemeType = 'light' | 'dark' | 'system'

function readThemeType(): ThemeType {
  const theme = document.documentElement.dataset.theme
  return theme === 'dark' || theme === 'light' ? theme : 'system'
}

/**
 * The page's light or dark choice from Settings (`html[data-theme]`), or the system's when there is
 * none. Code follows the page, not only the operating system, so a dark page on a light system
 * does not show light code.
 */
export function useThemeType(): ThemeType {
  const [type, setType] = useState<ThemeType>(readThemeType)
  useEffect(() => {
    const observer = new MutationObserver(() => setType(readThemeType()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return type
}

/** Pierre options the page's code blocks share. */
export function appearance(wrap: boolean, themeType: ThemeType = 'system', extraCSS = '') {
  return {
    themeType,
    // Pierre's WebAssembly highlighter. Every theme in Settings has a Highlights palette.
    preferredHighlighter: 'highlights' as const,
    overflow: wrap ? ('wrap' as const) : ('scroll' as const),
    unsafeCSS: `
    :host {
      --diffs-font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --diffs-font-size: 13.5px;
      --diffs-line-height: 22px;
    }
  ${extraCSS}`,
  }
}

export type CodeBlockProps = {
  code: string
  language: string
  startingLineNumber?: number
  diff?: boolean
  /** Lines to mark, counted from 1 at the fence's first line (AnnotatedCode's notes). */
  highlightLines?: readonly number[]
}

/** Tint the marked lines, gutter and code, with the page's `--mark` color. */
function highlightCSS(lines: readonly number[] | undefined): string {
  if (!lines || lines.length === 0) return ''
  const selectors = lines.map((line) => `[data-line-index="${line - 1}"]`).join(', ')
  return `:is(${selectors}) { background-color: color-mix(in srgb, var(--mark, #fff1b8) 70%, transparent) !important; }`
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

export function CodeBlock({ code, language, startingLineNumber, diff = false, highlightLines }: CodeBlockProps) {
  const named = language.trim()
  const theme = useDiffsThemePair()
  const wrap = useWrapCode()
  const themeType = useThemeType()
  const marked = highlightLines?.join(',') ?? ''
  const displayed = useMemo(() => codeForDisplay(code), [code])
  const file = useMemo<FileContents>(
    () => ({
      name: named ? `snippet.${named}` : 'snippet',
      contents: displayed,
      lang: named || 'text',
    }),
    [displayed, named],
  )
  const patch = useMemo(() => patchText(displayed, named), [displayed, named])
  const fileOptions = useMemo(
    () => ({
      ...appearance(wrap, themeType, highlightCSS(marked ? marked.split(',').map(Number) : undefined)),
      theme,
      disableFileHeader: true,
      onPostRender:
        startingLineNumber && startingLineNumber > 1
          ? (node: HTMLElement) => {
              renumber(node, startingLineNumber)
            }
          : undefined,
    }),
    [marked, startingLineNumber, theme, themeType, wrap],
  )
  const diffOptions = useMemo(
    () => ({
      ...appearance(wrap, themeType),
      theme,
      disableFileHeader: false,
      diffStyle: 'unified' as const,
      diffIndicators: 'bars' as const,
      hunkSeparators: 'line-info' as const,
    }),
    [theme, themeType, wrap],
  )

  if (diff) {
    return <PatchDiff patch={patch} options={diffOptions} disableWorkerPool className="plan-code" />
  }

  return (
    <File file={file} options={fileOptions} disableWorkerPool className="plan-code" />
  )
}
