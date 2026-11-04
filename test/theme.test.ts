import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ACCENT_PRESETS,
  accentCssCustomProperties,
  contrastRatio,
  DEFAULT_ACCENT,
  deriveAccentVars,
  DEFAULT_DIFFS_THEME,
  diffsThemePair,
  normalizeDiffsTheme,
  parseThemeConfig,
  saveThemeConfig,
  themePayload,
} from '../src/theme.ts'

function themeBlock(css: string, mode: 'light' | 'dark'): string {
  const [light, dark] = css.split(':root[data-theme="dark"]')
  return mode === 'light' ? light : dark
}

function cssColor(css: string, mode: 'light' | 'dark', name: string): string {
  const block = themeBlock(css, mode)
  const match = block.match(new RegExp(`${name}:\\s*([^;]+)`))
  assert.ok(match, `missing ${name} in ${mode}`)
  return match[1].trim()
}

test('accent css changes the swatch and leaves the document palette alone', () => {
  const teal = accentCssCustomProperties(DEFAULT_ACCENT)
  const rose = accentCssCustomProperties('#be123c')
  assert.notEqual(cssColor(teal, 'light', '--accent'), cssColor(rose, 'light', '--accent'))
  assert.notEqual(cssColor(teal, 'dark', '--accent'), cssColor(rose, 'dark', '--accent'))
  assert.match(cssColor(teal, 'light', '--accent'), /^#[0-9a-f]{6}$/)
  for (const css of [teal, rose]) {
    for (const mode of ['light', 'dark'] as const) {
      const block = themeBlock(css, mode)
      assert.doesNotMatch(block, /--(?:canvas|paper|surface|ink|panel|stage-bg|primary|page-top):/)
    }
  }
})

test('pageWidth defaults to default and reads a legacy fullWidth flag', () => {
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1' } }).pageWidth, 'default')
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1', pageWidth: 'narrow' } }).pageWidth, 'default')
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1', pageWidth: 'wide' } }).pageWidth, 'wide')
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1', pageWidth: 'full' } }).pageWidth, 'full')
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1', pageWidth: 'nope' } }).pageWidth, 'default')
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1', fullWidth: true } }).pageWidth, 'wide')
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1' }, layout: { fullWidth: true } }).pageWidth, 'wide')
  assert.equal(
    parseThemeConfig({ theme: { accent: '#0369a1', pageWidth: 'narrow', fullWidth: true } }).pageWidth,
    'default',
  )
  assert.equal(
    parseThemeConfig({ theme: { accent: '#0369a1', pageWidth: 'full', fullWidth: true } }).pageWidth,
    'full',
  )
  const payload = themePayload(parseThemeConfig({ theme: { accent: DEFAULT_ACCENT, pageWidth: 'wide' } }), 'cfg')
  assert.equal(payload.pageWidth, 'wide')
  const full = themePayload(parseThemeConfig({ theme: { accent: DEFAULT_ACCENT, pageWidth: 'full' } }), 'cfg')
  assert.equal(full.pageWidth, 'full')
})

test('diffsTheme defaults to pierre and maps Pierre theme names', () => {
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1' } }).diffsTheme, DEFAULT_DIFFS_THEME)
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1', diffsTheme: 'soft' } }).diffsTheme, 'soft')
  assert.equal(normalizeDiffsTheme('pierre-dark-vibrant'), 'vibrant')
  assert.deepEqual(diffsThemePair('soft'), {
    light: 'pierre-light-soft',
    dark: 'pierre-dark-soft',
  })
  const payload = themePayload(
    parseThemeConfig({ theme: { accent: DEFAULT_ACCENT, diffsTheme: 'tritanopia' } }),
    'cfg',
  )
  assert.equal(payload.diffsTheme, 'tritanopia')
  assert.equal(payload.diffsThemes.length, 5)
  assert.deepEqual(payload.diffsThemePair, {
    light: 'pierre-light-tritanopia',
    dark: 'pierre-dark-tritanopia',
  })
})

test('saveThemeConfig persists pageWidth beside accent and drops fullWidth', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'live-plan-theme-'))
  const path = join(dir, 'live-plan.config.json')
  await writeFile(
    path,
    `${JSON.stringify({ theme: { accent: '#0f766e', fullWidth: true }, layout: { fullWidth: true }, note: 'keep' }, null, 2)}\n`,
  )
  const saved = await saveThemeConfig(path, {
    accent: '#0369a1',
    pageWidth: 'full',
    diffsTheme: DEFAULT_DIFFS_THEME,
    wrapCode: false,
  })
  assert.deepEqual(saved, { accent: '#0369a1', pageWidth: 'full', diffsTheme: DEFAULT_DIFFS_THEME, wrapCode: false })
  const onDisk = JSON.parse(await readFile(path, 'utf8')) as {
    theme: { accent: string; pageWidth: string; fullWidth?: boolean; diffsTheme: string }
    layout?: unknown
    fullWidth?: boolean
    note?: string
  }
  assert.equal(onDisk.theme.accent, '#0369a1')
  assert.equal(onDisk.theme.pageWidth, 'full')
  assert.equal(onDisk.theme.fullWidth, undefined)
  assert.equal(onDisk.theme.diffsTheme, DEFAULT_DIFFS_THEME)
  assert.equal(onDisk.layout, undefined)
  assert.equal(onDisk.fullWidth, undefined)
  assert.equal(onDisk.note, 'keep')
})

test('saveThemeConfig persists diffsTheme beside accent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'live-plan-diffs-theme-'))
  const path = join(dir, 'live-plan.config.json')
  await writeFile(path, `${JSON.stringify({ theme: { accent: '#0f766e' }, note: 'keep' }, null, 2)}\n`)
  const saved = await saveThemeConfig(path, {
    accent: '#0f766e',
    pageWidth: 'default',
    diffsTheme: 'soft',
    wrapCode: false,
  })
  assert.deepEqual(saved, { accent: '#0f766e', pageWidth: 'default', diffsTheme: 'soft', wrapCode: false })
  const onDisk = JSON.parse(await readFile(path, 'utf8')) as {
    theme: { accent: string; pageWidth: string; diffsTheme: string; wrapCode: boolean }
    note?: string
  }
  assert.equal(onDisk.theme.diffsTheme, 'soft')
  assert.equal(onDisk.theme.wrapCode, false)
  assert.equal(onDisk.note, 'keep')
})

test('wrapCode defaults off and persists beside the other theme settings', () => {
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1' } }).wrapCode, false)
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1', wrapCode: true } }).wrapCode, true)
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1', wrapCode: 'true' } }).wrapCode, true)
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1', wrapCode: false } }).wrapCode, false)
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1', wrapCode: 'nope' } }).wrapCode, false)
  assert.equal(parseThemeConfig({ wrapCode: true, theme: { accent: '#0369a1' } }).wrapCode, true)
  const payload = themePayload(
    parseThemeConfig({ theme: { accent: DEFAULT_ACCENT, wrapCode: true } }),
    'cfg',
  )
  assert.equal(payload.wrapCode, true)
})

test('saveThemeConfig persists wrapCode and drops a top-level twin', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'live-plan-wrap-code-'))
  const path = join(dir, 'live-plan.config.json')
  await writeFile(
    path,
    `${JSON.stringify({ wrapCode: false, theme: { accent: '#0f766e', note: 'keep' } }, null, 2)}\n`,
  )
  const saved = await saveThemeConfig(path, {
    accent: '#0f766e',
    pageWidth: 'default',
    diffsTheme: DEFAULT_DIFFS_THEME,
    wrapCode: true,
  })
  assert.equal(saved.wrapCode, true)
  const onDisk = JSON.parse(await readFile(path, 'utf8')) as {
    wrapCode?: boolean
    theme: { accent: string; wrapCode: boolean; note?: string }
  }
  assert.equal(onDisk.wrapCode, undefined)
  assert.equal(onDisk.theme.wrapCode, true)
  assert.equal(onDisk.theme.note, 'keep')
})

test('accent buttons keep a readable label at rest, hover and active in both modes', () => {
  const rgb = (hex: string) => ({
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  })
  const accents = ['#0094fc', '#facc15', '#ffffff', '#000000', ...ACCENT_PRESETS.map((preset) => preset.accent)]
  for (const accent of accents) {
    for (const mode of ['light', 'dark'] as const) {
      const vars = deriveAccentVars(accent, mode)
      for (const fill of [vars.accentFill, vars.accentFillHover, vars.accentFillActive]) {
        const ratio = contrastRatio(rgb(fill), rgb(vars.onAccent))
        assert.ok(ratio >= 4.5, `${accent} ${mode}: ${vars.onAccent} on ${fill} is ${ratio.toFixed(2)}:1`)
      }
      assert.notEqual(vars.accentFillHover, vars.accentFill, `${accent} ${mode}: hover must differ`)
    }
  }
  const css = accentCssCustomProperties(DEFAULT_ACCENT)
  for (const mode of ['light', 'dark'] as const) {
    for (const name of ['--accent-fill', '--accent-fill-hover', '--accent-fill-active']) {
      assert.match(cssColor(css, mode, name), /^#[0-9a-f]{6}$/)
    }
  }
})
