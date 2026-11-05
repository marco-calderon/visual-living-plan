import { DIFFS_THEME_CATALOG } from './diffsThemeCatalog'

export const DEFAULT_DIFFS_THEME = 'pierre'

/** Separates the light and dark theme names in a saved custom pair, as in `github-light/github-dark`. */
export const DIFFS_THEME_PAIR_SEPARATOR = '/'

export type DiffsThemeMode = 'light' | 'dark'

export type DiffsThemeSample = {
  bg: string
  fg: string
  comment: string
  string: string
  keyword: string
  function: string
  added: string
  deleted: string
}

/** One syntax theme @pierre/diffs can load by name. */
export type DiffsThemeEntry = {
  name: string
  label: string
  mode: DiffsThemeMode
  group: 'pierre' | 'shiki'
  sample: DiffsThemeSample
}

export type DiffsThemePreset = {
  id: string
  label: string
  description: string
  light: string
  dark: string
  lightSample: DiffsThemeSample
  darkSample: DiffsThemeSample
}

export const DIFFS_THEMES: readonly DiffsThemeEntry[] = DIFFS_THEME_CATALOG

const THEMES_BY_NAME = new Map(DIFFS_THEMES.map((entry) => [entry.name, entry]))

export function diffsThemeEntry(name: string | undefined | null): DiffsThemeEntry | undefined {
  return name ? THEMES_BY_NAME.get(name) : undefined
}

/** Themes for one color mode, Pierre first, then the rest by label. */
export function diffsThemesForMode(mode: DiffsThemeMode): DiffsThemeEntry[] {
  return DIFFS_THEMES.filter((entry) => entry.mode === mode)
}

function sampleFor(name: string): DiffsThemeSample {
  const entry = THEMES_BY_NAME.get(name)
  if (!entry) throw new Error(`Missing diffs theme ${name} in the generated catalog`)
  return entry.sample
}

function preset(id: string, label: string, description: string, light: string, dark: string): DiffsThemePreset {
  return { id, label, description, light, dark, lightSample: sampleFor(light), darkSample: sampleFor(dark) }
}

/** Pierre first-party light and dark pairs. A saved family id stays valid. */
const DIFFS_PRESETS: DiffsThemePreset[] = [
  preset('pierre', 'Pierre', 'Default Pierre light and dark.', 'pierre-light', 'pierre-dark'),
  preset('soft', 'Soft', 'Softer contrast for long reading.', 'pierre-light-soft', 'pierre-dark-soft'),
  preset(
    'vibrant',
    'Vibrant',
    'Display P3 colors when the display supports them.',
    'pierre-light-vibrant',
    'pierre-dark-vibrant',
  ),
  preset(
    'protanopia-deuteranopia',
    'Protanopia & Deuteranopia',
    'CVD-safe palette for red–green deficiency.',
    'pierre-light-protanopia-deuteranopia',
    'pierre-dark-protanopia-deuteranopia',
  ),
  preset(
    'tritanopia',
    'Tritanopia',
    'CVD-safe palette for blue–yellow deficiency.',
    'pierre-light-tritanopia',
    'pierre-dark-tritanopia',
  ),
]

export const DIFFS_THEME_PRESETS = DIFFS_PRESETS

type DiffsThemePair = { light: string; dark: string }

/** Read a saved value into a light and dark theme. Null when it names no known theme. */
function resolvePair(raw: string | undefined | null): DiffsThemePair | null {
  if (!raw) return null
  const value = raw.trim().toLowerCase()
  const family = DIFFS_PRESETS.find(
    (item) => item.id === value || item.light === value || item.dark === value || `pierre-${item.id}` === value,
  )
  if (family) return { light: family.light, dark: family.dark }
  const parts = value.split(DIFFS_THEME_PAIR_SEPARATOR)
  if (parts.length !== 2) return null
  const light = THEMES_BY_NAME.get(parts[0]!.trim())
  const dark = THEMES_BY_NAME.get(parts[1]!.trim())
  if (light?.mode !== 'light' || dark?.mode !== 'dark') return null
  return { light: light.name, dark: dark.name }
}

/** Short form of a pair: a Pierre family id when one matches, otherwise `light/dark`. */
function encodePair(pair: DiffsThemePair): string {
  const family = DIFFS_PRESETS.find((item) => item.light === pair.light && item.dark === pair.dark)
  return family ? family.id : `${pair.light}${DIFFS_THEME_PAIR_SEPARATOR}${pair.dark}`
}

export function isKnownDiffsTheme(raw: string | undefined | null): boolean {
  return resolvePair(raw) !== null
}

/** A Pierre family id, or a `light/dark` pair of catalog themes. Unknown values fall back to Pierre. */
export function normalizeDiffsTheme(raw: string | undefined | null): string {
  const pair = resolvePair(raw)
  return pair ? encodePair(pair) : DEFAULT_DIFFS_THEME
}

export function diffsThemePair(value: string | undefined | null): DiffsThemePair {
  return resolvePair(value) ?? { light: DIFFS_PRESETS[0]!.light, dark: DIFFS_PRESETS[0]!.dark }
}

/** The saved value after choosing `name` for one mode. The other mode keeps its theme. */
export function diffsThemeWith(value: string | undefined | null, mode: DiffsThemeMode, name: string): string {
  const pair = diffsThemePair(value)
  const entry = THEMES_BY_NAME.get(name)
  if (!entry || entry.mode !== mode) return encodePair(pair)
  return encodePair(mode === 'light' ? { ...pair, light: entry.name } : { ...pair, dark: entry.name })
}

/** The Pierre family for a value, or Pierre when the value is a custom pair. */
export function diffsThemePreset(value: string | undefined | null): DiffsThemePreset {
  const normalized = normalizeDiffsTheme(value)
  return DIFFS_PRESETS.find((item) => item.id === normalized) ?? DIFFS_PRESETS[0]!
}

/** Readable name for a saved value: the family label, or both theme labels. */
export function diffsThemeLabel(value: string | undefined | null): string {
  const normalized = normalizeDiffsTheme(value)
  const family = DIFFS_PRESETS.find((item) => item.id === normalized)
  if (family) return family.label
  const pair = diffsThemePair(normalized)
  return `${THEMES_BY_NAME.get(pair.light)?.label ?? pair.light} · ${THEMES_BY_NAME.get(pair.dark)?.label ?? pair.dark}`
}
