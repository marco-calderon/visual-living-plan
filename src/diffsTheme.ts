export const DEFAULT_DIFFS_THEME = 'pierre'

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

export type DiffsThemePreset = {
  id: string
  label: string
  description: string
  light: string
  dark: string
  lightSample: DiffsThemeSample
  darkSample: DiffsThemeSample
}

/** Pierre first-party theme families registered by @pierre/diffs. */
const DIFFS_PRESETS: DiffsThemePreset[] = [
  {
    id: 'pierre',
    label: 'Pierre',
    description: 'Default Pierre light and dark.',
    light: 'pierre-light',
    dark: 'pierre-dark',
    lightSample: {
      bg: '#ffffff',
      fg: '#0a0a0a',
      comment: '#737373',
      string: '#199f43',
      keyword: '#d32a61',
      function: '#636363',
      added: '#18a46c',
      deleted: '#d52c36',
    },
    darkSample: {
      bg: '#0a0a0a',
      fg: '#fafafa',
      comment: '#737373',
      string: '#5ecc71',
      keyword: '#ff678d',
      function: '#a3a3a3',
      added: '#07c480',
      deleted: '#ff2e3f',
    },
  },
  {
    id: 'soft',
    label: 'Soft',
    description: 'Softer contrast for long reading.',
    light: 'pierre-light-soft',
    dark: 'pierre-dark-soft',
    lightSample: {
      bg: '#ffffff',
      fg: '#525252',
      comment: '#8a8a8a',
      string: '#0dbe4e',
      keyword: '#ff678d',
      function: '#737373',
      added: '#07c480',
      deleted: '#ff2e3f',
    },
    darkSample: {
      bg: '#171717',
      fg: '#d4d4d4',
      comment: '#636363',
      string: '#8cda94',
      keyword: '#ff91a8',
      function: '#8a8a8a',
      added: '#60d199',
      deleted: '#ff6762',
    },
  },
  {
    id: 'vibrant',
    label: 'Vibrant',
    description: 'Display P3 colors when the display supports them.',
    light: 'pierre-light-vibrant',
    dark: 'pierre-dark-vibrant',
    lightSample: {
      bg: '#ffffff',
      fg: '#0a0a0a',
      comment: '#737373',
      string: '#42a546',
      keyword: '#d53563',
      function: '#636363',
      added: '#44aa6f',
      deleted: '#d63838',
    },
    darkSample: {
      bg: '#0a0a0a',
      fg: '#fafafa',
      comment: '#737373',
      string: '#73d272',
      keyword: '#fe7292',
      function: '#a3a3a3',
      added: '#4ecc84',
      deleted: '#ff4043',
    },
  },
  {
    id: 'protanopia-deuteranopia',
    label: 'Protanopia & Deuteranopia',
    description: 'CVD-safe palette for red–green deficiency.',
    light: 'pierre-light-protanopia-deuteranopia',
    dark: 'pierre-dark-protanopia-deuteranopia',
    lightSample: {
      bg: '#ffffff',
      fg: '#0a0a0a',
      comment: '#737373',
      string: '#215584',
      keyword: '#8836c7',
      function: '#636363',
      added: '#216cab',
      deleted: '#ac6023',
    },
    darkSample: {
      bg: '#0a0a0a',
      fg: '#fafafa',
      comment: '#737373',
      string: '#97c4ff',
      keyword: '#b969f3',
      function: '#a3a3a3',
      added: '#97c4ff',
      deleted: '#fe8c2c',
    },
  },
  {
    id: 'tritanopia',
    label: 'Tritanopia',
    description: 'CVD-safe palette for blue–yellow deficiency.',
    light: 'pierre-light-tritanopia',
    dark: 'pierre-dark-tritanopia',
    lightSample: {
      bg: '#ffffff',
      fg: '#0a0a0a',
      comment: '#737373',
      string: '#1e858e',
      keyword: '#a631be',
      function: '#636363',
      added: '#1e858e',
      deleted: '#d5512f',
    },
    darkSample: {
      bg: '#0a0a0a',
      fg: '#fafafa',
      comment: '#737373',
      string: '#92dde4',
      keyword: '#d568ea',
      function: '#a3a3a3',
      added: '#92dde4',
      deleted: '#ff855e',
    },
  },
]

export const DIFFS_THEME_PRESETS = DIFFS_PRESETS

export function isKnownDiffsTheme(raw: string | undefined | null): boolean {
  if (!raw) return false
  const value = raw.trim().toLowerCase()
  return DIFFS_PRESETS.some(
    (preset) =>
      preset.id === value ||
      preset.light === value ||
      preset.dark === value ||
      `pierre-${preset.id}` === value,
  )
}

export function normalizeDiffsTheme(raw: string | undefined | null): string {
  if (!raw) return DEFAULT_DIFFS_THEME
  const value = raw.trim().toLowerCase()
  if (DIFFS_PRESETS.some((preset) => preset.id === value)) return value
  // Accept a concrete Pierre theme name and map it to its family.
  const fromName = DIFFS_PRESETS.find(
    (preset) => preset.light === value || preset.dark === value || `pierre-${preset.id}` === value,
  )
  return fromName?.id ?? DEFAULT_DIFFS_THEME
}

export function diffsThemePreset(id: string | undefined | null): DiffsThemePreset {
  const normalized = normalizeDiffsTheme(id)
  return DIFFS_PRESETS.find((preset) => preset.id === normalized) ?? DIFFS_PRESETS[0]!
}

export function diffsThemePair(id: string | undefined | null): { light: string; dark: string } {
  const preset = diffsThemePreset(id)
  return { light: preset.light, dark: preset.dark }
}
