import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import {
  DEFAULT_DIFFS_THEME,
  diffsThemeEntry,
  diffsThemePair,
  diffsThemesForMode,
  diffsThemeWith,
  normalizeDiffsTheme,
  type DiffsThemeEntry,
  type DiffsThemeMode,
  type DiffsThemeSample,
} from '../../src/diffsTheme.ts'

const MODES: ReadonlyArray<{ id: DiffsThemeMode; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

function sampleStyle(sample: DiffsThemeSample): CSSProperties {
  return {
    '--sample-bg': sample.bg,
    '--sample-fg': sample.fg,
    '--sample-comment': sample.comment,
    '--sample-string': sample.string,
    '--sample-keyword': sample.keyword,
    '--sample-function': sample.function,
    '--sample-added': sample.added,
    '--sample-deleted': sample.deleted,
  } as CSSProperties
}

function ThemeSample({ sample }: { sample: DiffsThemeSample }) {
  return (
    <div className="diffs-theme-sample" style={sampleStyle(sample)} aria-hidden="true">
      <span className="tok-comment">{'// sample'}</span>
      <span>
        <span className="tok-keyword">const</span> <span className="tok-fn">run</span> = <span className="tok-string">'ok'</span>
      </span>
      <span>
        <span className="tok-added">+ keep</span> <span className="tok-deleted">- drop</span>
      </span>
    </div>
  )
}

function pageMode(): DiffsThemeMode {
  if (typeof document === 'undefined') return 'light'
  const theme = document.documentElement.dataset.theme
  if (theme === 'dark' || theme === 'light') return theme
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Follow the saved value on <html>, which the plan page updates after a save or a live theme event. */
function useRootDiffsTheme(initial: string, followRoot: boolean): string {
  const [value, setValue] = useState(initial)
  useEffect(() => {
    if (!followRoot) return
    const root = document.documentElement
    const sync = () => {
      const next = root.dataset.diffsTheme
      if (next) setValue(normalizeDiffsTheme(next))
    }
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['data-diffs-theme'] })
    return () => observer.disconnect()
  }, [followRoot])
  useEffect(() => setValue(normalizeDiffsTheme(initial)), [initial])
  return value
}

function ThemeGroup({
  title,
  entries,
  mode,
  value,
  selected,
  onSelect,
}: {
  title: string
  entries: DiffsThemeEntry[]
  mode: DiffsThemeMode
  value: string
  selected: string
  onSelect?: (next: string, label: string) => void
}) {
  if (entries.length === 0) return null
  return (
    <div className="diffs-theme-group" role="group" aria-label={title}>
      <p className="diffs-theme-group-title">{title}</p>
      <div className="diffs-theme-grid">
        {entries.map((entry) => {
          const next = diffsThemeWith(value, mode, entry.name)
          const checked = entry.name === selected
          return (
            <button
              key={entry.name}
              type="button"
              role="radio"
              className="diffs-theme-option"
              aria-checked={checked}
              aria-label={entry.label}
              title={entry.label}
              data-diffs-theme={onSelect ? undefined : next}
              data-diffs-theme-label={entry.label}
              data-diffs-theme-name={entry.name}
              onClick={() => {
                if (checked || !onSelect) return
                onSelect(next, entry.label)
              }}
            >
              <ThemeSample sample={entry.sample} />
              <span className="diffs-theme-option-meta">
                <strong>{entry.label}</strong>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Light and dark syntax theme picker. Each tab picks the theme for one page color mode.
 * Without onSelect, each option carries the value it saves in data-diffs-theme for the plan page's click handler.
 */
export function DiffsThemePicker({
  value: initial = DEFAULT_DIFFS_THEME,
  onSelect,
  followRoot = true,
}: {
  value?: string
  onSelect?: (next: string, label: string) => void
  /** Track the page's data-diffs-theme. Off where the page may show someone else's plan. */
  followRoot?: boolean
}) {
  const value = useRootDiffsTheme(initial, followRoot)
  const pair = diffsThemePair(value)
  const [mode, setMode] = useState<DiffsThemeMode>('light')
  const listRef = useRef<HTMLDivElement>(null)
  const selected = mode === 'light' ? pair.light : pair.dark
  const entries = diffsThemesForMode(mode)

  useLayoutEffect(() => setMode(pageMode()), [])

  // Bring the chosen theme into view inside the list without scrolling the page.
  useLayoutEffect(() => {
    const list = listRef.current
    const option = list?.querySelector<HTMLElement>('[aria-checked="true"]')
    if (!list || !option) return
    const top = option.offsetTop - list.offsetTop
    if (top < list.scrollTop || top + option.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, top - 12)
    }
  }, [mode])

  return (
    <div className="diffs-theme-picker">
      <div className="diffs-theme-picker-head">
        <div className="diffs-theme-picker-current">
          {MODES.map((item) => (
            <span key={item.id}>
              {item.label}: <strong>{diffsThemeEntry(pair[item.id])?.label ?? pair[item.id]}</strong>
            </span>
          ))}
        </div>
        <div className="width-choices diffs-theme-tabs" role="tablist" aria-label="Color mode">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`diffs-theme-tab-${item.id}`}
              className="width-choice"
              aria-selected={mode === item.id}
              aria-checked={mode === item.id}
              aria-controls="diffs-theme-list"
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={listRef}
        id="diffs-theme-list"
        className="diffs-theme-list"
        role="tabpanel"
        aria-labelledby={`diffs-theme-tab-${mode}`}
        tabIndex={0}
      >
        <div role="radiogroup" aria-label={`${mode === 'light' ? 'Light' : 'Dark'} syntax themes`}>
          <ThemeGroup
            title="Pierre"
            entries={entries.filter((entry) => entry.group === 'pierre')}
            mode={mode}
            value={value}
            selected={selected}
            onSelect={onSelect}
          />
          <ThemeGroup
            title="More themes"
            entries={entries.filter((entry) => entry.group !== 'pierre')}
            mode={mode}
            value={value}
            selected={selected}
            onSelect={onSelect}
          />
        </div>
      </div>
    </div>
  )
}
