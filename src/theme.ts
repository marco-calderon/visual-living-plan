import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  DEFAULT_DIFFS_THEME,
  DIFFS_THEME_PRESETS,
  diffsThemePreset,
  normalizeDiffsTheme,
} from './diffsTheme'

export {
  DEFAULT_DIFFS_THEME,
  DIFFS_THEME_PRESETS,
  diffsThemePair,
  diffsThemePreset,
  isKnownDiffsTheme,
  normalizeDiffsTheme,
  type DiffsThemePreset,
  type DiffsThemeSample,
} from './diffsTheme'

export const DEFAULT_ACCENT = '#0f766e'
export const DEFAULT_CONFIG_FILENAME = 'live-plan.config.json'

/**
 * Document columns. Default is the 720px prose measure in DESIGN.md.
 * Narrow is a tighter read. Wide is two narrow columns, for a row of two cards.
 * There is no fourth width.
 */
export const PAGE_WIDTH_PX = {
  narrow: 560,
  default: 720,
  wide: 1120,
} as const

export const PAGE_WIDTHS = ['narrow', 'default', 'wide'] as const
export type PageWidth = (typeof PAGE_WIDTHS)[number]
export const DEFAULT_PAGE_WIDTH: PageWidth = 'default'

export const PAGE_WIDTH_OPTIONS: ReadonlyArray<{ id: PageWidth; label: string }> = [
  { id: 'narrow', label: 'Narrow' },
  { id: 'default', label: 'Default' },
  { id: 'wide', label: 'Wide' },
]

export function isPageWidth(value: unknown): value is PageWidth {
  return typeof value === 'string' && (PAGE_WIDTHS as readonly string[]).includes(value)
}

export type ThemeConfig = {
  accent: string
  /** Document column shared by Plan, Workflow, and Settings. */
  pageWidth: PageWidth
  /** Pierre @pierre/diffs theme family (light/dark pair). */
  diffsTheme: string
}

export type ThemeAccentVars = {
  accent: string
  onAccent: string
  washAccent: string
  accentSoft: string
  accentBorder: string
  accentHoverBorder: string
  accentHoverShadow: string
  codeInlineBg: string
  pulse: string
  nodeActiveBorder: string
  nodeActiveRing: string
}

/** Eight accents tuned for contrast on light paper and dark stage surfaces. */
const PRESETS = [
  { id: 'teal', label: 'Teal', accent: '#0f766e' },
  { id: 'cyan', label: 'Cyan', accent: '#0e7490' },
  { id: 'sky', label: 'Sky', accent: '#0369a1' },
  { id: 'blue', label: 'Blue', accent: '#1d4ed8' },
  { id: 'violet', label: 'Violet', accent: '#6d28d9' },
  { id: 'magenta', label: 'Magenta', accent: '#a21caf' },
  { id: 'rose', label: 'Rose', accent: '#be123c' },
  { id: 'amber', label: 'Amber', accent: '#b45309' },
] as const

export const ACCENT_PRESETS = PRESETS

export function defaultThemeConfig(): ThemeConfig {
  return { accent: DEFAULT_ACCENT, pageWidth: DEFAULT_PAGE_WIDTH, diffsTheme: DEFAULT_DIFFS_THEME }
}

export function configPathBesidePlan(planPath: string, filename = DEFAULT_CONFIG_FILENAME): string {
  return resolve(dirname(resolve(planPath)), filename)
}

export function normalizeAccent(raw: string | undefined | null): string | null {
  if (!raw) return null
  const value = raw.trim()
  const short = value.match(/^#([0-9a-fA-F]{3})$/)
  if (short) {
    const [r, g, b] = short[1]
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const full = value.match(/^#([0-9a-fA-F]{6})$/)
  if (full) return `#${full[1].toLowerCase()}`
  const rgb = value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+\s*)?\)$/i)
  if (rgb) {
    const channels = [rgb[1], rgb[2], rgb[3]].map((part) => {
      const n = Number(part)
      if (!Number.isFinite(n) || n < 0 || n > 255) return null
      return n.toString(16).padStart(2, '0')
    })
    if (channels.every((part) => part !== null)) {
      return `#${channels.join('')}`
    }
  }
  return null
}

function parseFullWidth(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function readPageWidth(theme: Record<string, unknown>, layout: Record<string, unknown> | undefined, record: Record<string, unknown>): PageWidth {
  const explicit =
    theme.pageWidth !== undefined
      ? theme.pageWidth
      : layout?.pageWidth !== undefined
        ? layout.pageWidth
        : record.pageWidth
  if (isPageWidth(explicit)) return explicit
  const fullWidthRaw =
    theme.fullWidth !== undefined
      ? theme.fullWidth
      : layout?.fullWidth !== undefined
        ? layout.fullWidth
        : record.fullWidth
  if (fullWidthRaw === undefined) return DEFAULT_PAGE_WIDTH
  return parseFullWidth(fullWidthRaw) ? 'wide' : DEFAULT_PAGE_WIDTH
}

export function parseThemeConfig(raw: unknown): ThemeConfig {
  const defaults = defaultThemeConfig()
  if (!raw || typeof raw !== 'object') return defaults
  const record = raw as Record<string, unknown>
  const theme =
    record.theme && typeof record.theme === 'object'
      ? (record.theme as Record<string, unknown>)
      : record
  const accent = normalizeAccent(typeof theme.accent === 'string' ? theme.accent : undefined)
  const layout =
    record.layout && typeof record.layout === 'object'
      ? (record.layout as Record<string, unknown>)
      : undefined
  const diffsThemeRaw =
    typeof theme.diffsTheme === 'string'
      ? theme.diffsTheme
      : typeof record.diffsTheme === 'string'
        ? record.diffsTheme
        : undefined
  return {
    accent: accent ?? defaults.accent,
    pageWidth: readPageWidth(theme, layout, record),
    diffsTheme: normalizeDiffsTheme(diffsThemeRaw),
  }
}

export async function loadThemeConfig(path: string): Promise<ThemeConfig> {
  try {
    const text = await readFile(resolve(path), 'utf8')
    return parseThemeConfig(JSON.parse(text) as unknown)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return defaultThemeConfig()
    throw error
  }
}

export async function saveThemeConfig(path: string, config: ThemeConfig): Promise<ThemeConfig> {
  const absolute = resolve(path)
  const accent = normalizeAccent(config.accent)
  if (!accent) {
    throw new Error(`Invalid accent color: ${config.accent}`)
  }
  const diffsTheme = normalizeDiffsTheme(config.diffsTheme)
  const next: ThemeConfig = { accent, pageWidth: isPageWidth(config.pageWidth) ? config.pageWidth : DEFAULT_PAGE_WIDTH, diffsTheme }
  await mkdir(dirname(absolute), { recursive: true })
  let existing: Record<string, unknown> = {}
  try {
    const text = await readFile(absolute, 'utf8')
    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed === 'object') existing = parsed as Record<string, unknown>
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') throw error
  }
  const previousTheme =
    existing.theme && typeof existing.theme === 'object'
      ? (existing.theme as Record<string, unknown>)
      : {}
  const themeRest = { ...previousTheme }
  delete themeRest.fullWidth
  delete themeRest.pageWidth
  delete themeRest.diffsTheme
  const payload: Record<string, unknown> = {
    ...existing,
    theme: {
      ...themeRest,
      accent: next.accent,
      pageWidth: next.pageWidth,
      diffsTheme: next.diffsTheme,
    },
  }
  // Prefer theme.pageWidth; drop a legacy fullWidth or layout twin if present.
  if (payload.layout && typeof payload.layout === 'object') {
    const layout = { ...(payload.layout as Record<string, unknown>) }
    delete layout.fullWidth
    delete layout.pageWidth
    if (Object.keys(layout).length === 0) delete payload.layout
    else payload.layout = layout
  }
  delete payload.fullWidth
  delete payload.pageWidth
  delete payload.diffsTheme
  await writeFile(absolute, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return next
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeAccent(hex) ?? DEFAULT_ACCENT
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  }
}

function rgba({ r, g, b }: { r: number; g: number; b: number }, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (value: number) => {
    const s = value / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function mix(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  amount: number,
): { r: number; g: number; b: number } {
  return {
    r: Math.round(a.r + (b.r - a.r) * amount),
    g: Math.round(a.g + (b.g - a.g) * amount),
    b: Math.round(a.b + (b.b - a.b) * amount),
  }
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('')}`
}

type Hsl = { h: number; s: number; l: number }
type Chroma = { h: number; chromatic: boolean }

/** Below this saturation the hue is noise, so surfaces stay neutral gray. */
const CHROMA_FLOOR = 0.08

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const delta = max - min
  if (delta === 0) return { h: 0, s: 0, l }
  const s = delta / (1 - Math.abs(2 * l - 1))
  let hue: number
  if (max === rn) hue = ((gn - bn) / delta) % 6
  else if (max === gn) hue = (bn - rn) / delta + 2
  else hue = (rn - gn) / delta + 4
  hue *= 60
  if (hue < 0) hue += 360
  return { h: hue, s, l }
}

function hslToRgb({ h, s, l }: Hsl): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) {
    r = c
    g = x
  } else if (hp < 2) {
    r = x
    g = c
  } else if (hp < 3) {
    g = c
    b = x
  } else if (hp < 4) {
    g = x
    b = c
  } else if (hp < 5) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

function accentChroma(accent: string): Chroma {
  const hsl = rgbToHsl(hexToRgb(accent))
  return { h: hsl.h, chromatic: hsl.s >= CHROMA_FLOOR }
}

/** Repaint a neutral at the accent hue, keeping the original saturation and lightness. */
function paint(chroma: Chroma, saturation: number, lightness: number): { r: number; g: number; b: number } {
  return hslToRgb({
    h: chroma.h,
    s: chroma.chromatic ? saturation : 0,
    l: lightness,
  })
}

/** Lift dark accents toward a readable mid luminance on dark surfaces. */
export function accentForMode(accent: string, mode: 'light' | 'dark'): string {
  const normalized = normalizeAccent(accent) ?? DEFAULT_ACCENT
  const rgb = hexToRgb(normalized)
  if (mode === 'light') return normalized
  const luminance = relativeLuminance(rgb)
  if (luminance >= 0.48) return normalized
  // Aim near ~0.55 so accents stay vivid on dark paper without washing out.
  let amount = 0.28
  let lifted = rgb
  for (let step = 0; step < 8; step += 1) {
    lifted = mix(rgb, { r: 255, g: 255, b: 255 }, amount)
    if (relativeLuminance(lifted) >= 0.52) break
    amount += 0.06
  }
  return toHex(lifted)
}

export function deriveAccentVars(accent: string, mode: 'light' | 'dark'): ThemeAccentVars {
  const resolved = accentForMode(accent, mode)
  const rgb = hexToRgb(resolved)
  const onAccent =
    relativeLuminance(rgb) > 0.55 ? toHex(paint(accentChroma(resolved), 0.35, 0.16)) : '#ffffff'
  const soft = mode === 'dark' ? 0.14 : 0.08
  const border = mode === 'dark' ? 0.32 : 0.22
  const hover = mode === 'dark' ? 0.55 : 0.45
  return {
    accent: resolved,
    onAccent,
    washAccent: rgba(rgb, mode === 'dark' ? 0.16 : 0.16),
    accentSoft: rgba(rgb, soft),
    accentBorder: rgba(rgb, border),
    accentHoverBorder: rgba(rgb, hover),
    accentHoverShadow:
      mode === 'dark' ? '0 10px 24px rgba(0, 0, 0, 0.28)' : `0 10px 24px ${rgba(rgb, 0.12)}`,
    codeInlineBg: rgba(rgb, mode === 'dark' ? 0.14 : 0.08),
    pulse: rgba(rgb, 0.45),
    nodeActiveBorder: rgba(rgb, mode === 'dark' ? 0.7 : 0.55),
    nodeActiveRing: rgba(rgb, mode === 'dark' ? 0.2 : 0.12),
  }
}

/** Accent swatches and node highlights only. Canvas, surface, and ink stay in the page stylesheet. */
export function accentCssCustomProperties(accent: string): string {
  const light = deriveAccentVars(accent, 'light')
  const dark = deriveAccentVars(accent, 'dark')
  const lines = (vars: ThemeAccentVars, mode: 'light' | 'dark') => `
  --accent: ${vars.accent};
  --on-accent: ${vars.onAccent};
  --wash-accent: ${vars.washAccent};
  --accent-soft: ${vars.accentSoft};
  --accent-border: ${vars.accentBorder};
  --accent-hover-border: ${vars.accentHoverBorder};
  --accent-hover-shadow: ${vars.accentHoverShadow};
  --code-inline-bg: ${vars.codeInlineBg};
  --pulse: ${vars.pulse};
  --node-active-border: ${vars.nodeActiveBorder};
  --node-active-ring: ${vars.nodeActiveRing};
`
  return `
:root {
${lines(light, 'light')}
}
:root[data-theme="dark"] {
${lines(dark, 'dark')}
}
`
}

export function themePayload(config: ThemeConfig, configPath: string) {
  const diffsTheme = normalizeDiffsTheme(config.diffsTheme)
  const diffs = diffsThemePreset(diffsTheme)
  return {
    accent: config.accent,
    pageWidth: isPageWidth(config.pageWidth) ? config.pageWidth : DEFAULT_PAGE_WIDTH,
    diffsTheme,
    diffsThemePair: { light: diffs.light, dark: diffs.dark },
    configPath,
    presets: PRESETS.map((preset) => ({ ...preset })),
    diffsThemes: DIFFS_THEME_PRESETS.map((preset) => ({
      id: preset.id,
      label: preset.label,
      description: preset.description,
      light: preset.light,
      dark: preset.dark,
      lightSample: { ...preset.lightSample },
      darkSample: { ...preset.darkSample },
    })),
    css: accentCssCustomProperties(config.accent),
  }
}
