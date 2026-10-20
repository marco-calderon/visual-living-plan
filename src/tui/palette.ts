import { DEFAULT_ACCENT, deriveAccentVars } from '../theme'
import type { ColorMode } from './systemTheme'

/** Glyph accepts `#rrggbb`. Theme helpers return plain strings. */
type HexColor = `#${string}`

function hexColor(value: string): HexColor {
  return value.startsWith('#') ? (value as HexColor) : '#000000'
}

/** Opaque colors the terminal can paint. Accent fields come from the theme. */
export type Palette = {
  ink: HexColor
  muted: HexColor
  paper: HexColor
  panel: HexColor
  line: HexColor
  accent: HexColor
  onAccent: HexColor
  accentSoft: HexColor
  good: HexColor
  goodSoft: HexColor
  warn: HexColor
  warnSoft: HexColor
  hover: HexColor
}

type Surfaces = Omit<Palette, 'accent' | 'onAccent' | 'accentSoft' | 'hover'>

/** Light surfaces from the control dashboard page. */
const lightSurfaces: Surfaces = {
  ink: '#14211c',
  muted: '#4d6158',
  paper: '#f3f6f3',
  panel: '#ffffff',
  line: '#d5ddd8',
  good: '#166534',
  goodSoft: '#dcfce7',
  warn: '#92400e',
  warnSoft: '#ffedd5',
}

/** Dark surfaces from the control dashboard page, flattened to opaque hex. */
const darkSurfaces: Surfaces = {
  ink: '#e8f3ee',
  muted: '#b7c7c0',
  paper: '#101816',
  panel: '#16231f',
  line: '#2e3734',
  good: '#86efac',
  goodSoft: '#24382c',
  warn: '#fdba74',
  warnSoft: '#3a2e24',
}

function hexChannels(hex: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

function toHex(r: number, g: number, b: number): HexColor {
  return `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')}`
}

/** Paint an `rgba()` accent tint onto an opaque surface. */
function over(rgba: string, background: HexColor): HexColor {
  const match = rgba.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/)
  if (!match) return background
  const alpha = Number(match[4])
  const bg = hexChannels(background)
  return toHex(
    Number(match[1]) * alpha + bg.r * (1 - alpha),
    Number(match[2]) * alpha + bg.g * (1 - alpha),
    Number(match[3]) * alpha + bg.b * (1 - alpha),
  )
}

/**
 * Dashboard surfaces for the system color mode.
 * Accent, the label on that accent, and the tinted row fills come from the theme.
 */
export function createPalette(mode: ColorMode, accent: string = DEFAULT_ACCENT): Palette {
  const vars = deriveAccentVars(accent, mode)
  const surfaces = mode === 'dark' ? darkSurfaces : lightSurfaces
  return {
    ...surfaces,
    accent: hexColor(vars.accent),
    onAccent: hexColor(vars.onAccent),
    accentSoft: over(vars.accentBorder, surfaces.panel),
    hover: over(vars.accentSoft, surfaces.panel),
  }
}

/** Light palette used when a screen has not resolved the system theme yet. */
export const palette = createPalette('light')
