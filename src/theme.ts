import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export const DEFAULT_ACCENT = '#0f766e'
export const DEFAULT_CONFIG_FILENAME = 'live-plan.config.json'

export type ThemeConfig = {
  accent: string
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
  return { accent: DEFAULT_ACCENT }
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

export function parseThemeConfig(raw: unknown): ThemeConfig {
  const defaults = defaultThemeConfig()
  if (!raw || typeof raw !== 'object') return defaults
  const record = raw as Record<string, unknown>
  const theme =
    record.theme && typeof record.theme === 'object'
      ? (record.theme as Record<string, unknown>)
      : record
  const accent = normalizeAccent(typeof theme.accent === 'string' ? theme.accent : undefined)
  return {
    accent: accent ?? defaults.accent,
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
  const next: ThemeConfig = { accent }
  await mkdir(dirname(absolute), { recursive: true })
  await writeFile(absolute, `${JSON.stringify({ theme: next }, null, 2)}\n`, 'utf8')
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
  const onAccent = relativeLuminance(rgb) > 0.55 ? '#06221e' : '#ffffff'
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

export function accentCssCustomProperties(accent: string): string {
  const light = deriveAccentVars(accent, 'light')
  const dark = deriveAccentVars(accent, 'dark')
  const lines = (vars: ThemeAccentVars) => `
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
${lines(light)}
}
:root[data-theme="dark"] {
${lines(dark)}
}
`
}

export function themePayload(config: ThemeConfig, configPath: string) {
  return {
    accent: config.accent,
    configPath,
    presets: PRESETS.map((preset) => ({ ...preset })),
    css: accentCssCustomProperties(config.accent),
  }
}
