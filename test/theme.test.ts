import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  accentCssCustomProperties,
  DEFAULT_ACCENT,
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
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1', pageWidth: 'narrow' } }).pageWidth, 'narrow')
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1', pageWidth: 'wide' } }).pageWidth, 'wide')
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1', pageWidth: 'nope' } }).pageWidth, 'default')
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1', fullWidth: true } }).pageWidth, 'wide')
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1' }, layout: { fullWidth: true } }).pageWidth, 'wide')
  assert.equal(
    parseThemeConfig({ theme: { accent: '#0369a1', pageWidth: 'narrow', fullWidth: true } }).pageWidth,
    'narrow',
  )
  const payload = themePayload(parseThemeConfig({ theme: { accent: DEFAULT_ACCENT, pageWidth: 'wide' } }), 'cfg')
  assert.equal(payload.pageWidth, 'wide')
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
    pageWidth: 'narrow',
    diffsTheme: DEFAULT_DIFFS_THEME,
  })
  assert.deepEqual(saved, { accent: '#0369a1', pageWidth: 'narrow', diffsTheme: DEFAULT_DIFFS_THEME })
  const onDisk = JSON.parse(await readFile(path, 'utf8')) as {
    theme: { accent: string; pageWidth: string; fullWidth?: boolean; diffsTheme: string }
    layout?: unknown
    fullWidth?: boolean
    note?: string
  }
  assert.equal(onDisk.theme.accent, '#0369a1')
  assert.equal(onDisk.theme.pageWidth, 'narrow')
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
  })
  assert.deepEqual(saved, { accent: '#0f766e', pageWidth: 'default', diffsTheme: 'soft' })
  const onDisk = JSON.parse(await readFile(path, 'utf8')) as {
    theme: { accent: string; pageWidth: string; diffsTheme: string }
    note?: string
  }
  assert.equal(onDisk.theme.diffsTheme, 'soft')
  assert.equal(onDisk.note, 'keep')
})
