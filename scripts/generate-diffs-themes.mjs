// Writes src/diffsThemeCatalog.ts: every syntax theme @pierre/diffs can load by name,
// with its mode and eight preview colors. Settings draws previews from this file,
// so the page never loads the themes themselves.
// Run after upgrading shiki, @pierre/theme, or @pierre/theming: node scripts/generate-diffs-themes.mjs
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { bundledThemesInfo } from 'shiki'
import { pierreThemes, shikiThemes } from '@pierre/theming/themes'

const out = fileURLToPath(new URL('../src/diffsThemeCatalog.ts', import.meta.url))

const PIERRE_LABELS = {
  'pierre-light': 'Pierre Light',
  'pierre-dark': 'Pierre Dark',
  'pierre-light-soft': 'Pierre Light Soft',
  'pierre-dark-soft': 'Pierre Dark Soft',
  'pierre-light-vibrant': 'Pierre Light Vibrant',
  'pierre-dark-vibrant': 'Pierre Dark Vibrant',
  'pierre-light-protanopia-deuteranopia': 'Pierre Light Protanopia & Deuteranopia',
  'pierre-dark-protanopia-deuteranopia': 'Pierre Dark Protanopia & Deuteranopia',
  'pierre-light-tritanopia': 'Pierre Light Tritanopia',
  'pierre-dark-tritanopia': 'Pierre Dark Tritanopia',
}

const PIERRE_ORDER = Object.keys(PIERRE_LABELS)

function scopesOf(rule) {
  if (!rule.scope) return []
  const list = Array.isArray(rule.scope) ? rule.scope : String(rule.scope).split(',')
  return list.map((scope) => scope.trim()).filter(Boolean)
}

/** First rule color for the best scope: exact match wins over a child scope. */
function tokenColor(theme, targets) {
  const rules = (theme.tokenColors ?? theme.settings ?? []).filter((rule) => rule.settings?.foreground)
  for (const target of targets) {
    const exact = rules.find((rule) => scopesOf(rule).includes(target))
    if (exact) return exact.settings.foreground
  }
  for (const target of targets) {
    const child = rules.find((rule) => scopesOf(rule).some((scope) => scope.startsWith(`${target}.`)))
    if (child) return child.settings.foreground
  }
  return undefined
}

function globalSetting(theme, key) {
  const rules = theme.tokenColors ?? theme.settings ?? []
  return rules.find((rule) => !rule.scope && rule.settings?.[key])?.settings[key]
}

/** Six-digit hex, alpha dropped, so a preview never shows a washed-out color. */
function solidColor(color) {
  if (typeof color !== 'string') return undefined
  const value = color.trim().toLowerCase()
  const short = value.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])[0-9a-f]?$/)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
  const full = value.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/)
  if (full) return `#${full[1]}`
  // Vibrant Pierre themes use Display P3. The channels are close enough to sRGB for a preview.
  const p3 = value.match(/^color\(display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
  if (p3) {
    const hex = p3.slice(1, 4).map((part) => Math.round(Math.min(1, Math.max(0, Number(part))) * 255).toString(16).padStart(2, '0'))
    return `#${hex.join('')}`
  }
  return undefined
}

function sampleOf(theme, mode) {
  const colors = theme.colors ?? {}
  // A normalized theme stands placeholder hex values in for Display P3 colors.
  const replacements = theme.colorReplacements ?? {}
  const solid = (color) => solidColor(typeof color === 'string' ? (replacements[color.toLowerCase()] ?? replacements[color] ?? color) : color)
  const bg = solid(colors['editor.background']) ?? solid(globalSetting(theme, 'background')) ?? (mode === 'light' ? '#ffffff' : '#1e1e1e')
  const fg =
    solid(colors['editor.foreground']) ??
    solid(colors.foreground) ??
    solid(globalSetting(theme, 'foreground')) ??
    (mode === 'light' ? '#333333' : '#d4d4d4')
  const pick = (targets, ...fallbacks) => solid(tokenColor(theme, targets)) ?? fallbacks.map(solid).find(Boolean) ?? fg
  return {
    bg,
    fg,
    comment: pick(['comment', 'punctuation.definition.comment']),
    string: pick(['string', 'string.quoted']),
    keyword: pick(['keyword', 'storage.type', 'storage', 'keyword.control']),
    function: pick(['entity.name.function', 'support.function', 'meta.function-call']),
    added: pick(['markup.inserted'], colors['gitDecoration.addedResourceForeground'], colors['terminal.ansiGreen'], '#2da44e'),
    deleted: pick(['markup.deleted'], colors['gitDecoration.deletedResourceForeground'], colors['terminal.ansiRed'], '#cf222e'),
  }
}

async function load(descriptor) {
  const loaded = await descriptor.load()
  return loaded.default ?? loaded
}

const info = new Map(bundledThemesInfo.map((entry) => [entry.id, entry]))
const entries = []

for (const name of PIERRE_ORDER) {
  const descriptor = pierreThemes.getTheme(name)
  if (!descriptor) throw new Error(`@pierre/theming has no ${name}`)
  const theme = await load(descriptor)
  const mode = theme.type === 'light' ? 'light' : 'dark'
  entries.push({ name, label: PIERRE_LABELS[name], mode, group: 'pierre', sample: sampleOf(theme, mode) })
}

const shikiNames = [...info.keys()].filter((name) => shikiThemes.getTheme(name)).sort()
for (const name of shikiNames) {
  const theme = await load(shikiThemes.getTheme(name))
  const meta = info.get(name)
  const mode = meta.type === 'light' ? 'light' : 'dark'
  entries.push({ name, label: meta.displayName, mode, group: 'shiki', sample: sampleOf(theme, mode) })
}

const body = entries
  .map((entry) => {
    const s = entry.sample
    return `  { name: ${JSON.stringify(entry.name)}, label: ${JSON.stringify(entry.label)}, mode: '${entry.mode}', group: '${entry.group}', sample: { bg: '${s.bg}', fg: '${s.fg}', comment: '${s.comment}', string: '${s.string}', keyword: '${s.keyword}', function: '${s.function}', added: '${s.added}', deleted: '${s.deleted}' } },`
  })
  .join('\n')

const source = `// Generated by scripts/generate-diffs-themes.mjs. Do not edit.
import type { DiffsThemeEntry } from './diffsTheme'

/** Every syntax theme @pierre/diffs loads by name, with preview colors. Theme files load only when chosen. */
export const DIFFS_THEME_CATALOG: readonly DiffsThemeEntry[] = [
${body}
]
`

await writeFile(out, source, 'utf8')
console.log(`Wrote ${entries.length} themes to ${out}`)
