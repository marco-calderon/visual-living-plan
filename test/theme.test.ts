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

function hexChannels(color: string): { r: number; g: number; b: number } {
  assert.match(color, /^#[0-9a-f]{6}$/)
  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
  }
}

test('page surfaces follow the configured accent hue', () => {
  const teal = hexChannels(cssColor(accentCssCustomProperties(DEFAULT_ACCENT), 'light', '--paper'))
  assert.ok(teal.g >= teal.r && teal.g >= teal.b)
  assert.ok(Math.abs(teal.r - 238) <= 6)
  assert.ok(Math.abs(teal.g - 243) <= 6)

  const rose = hexChannels(cssColor(accentCssCustomProperties('#be123c'), 'light', '--paper'))
  assert.ok(rose.r > rose.g && rose.r > rose.b)

  const blue = hexChannels(cssColor(accentCssCustomProperties('#1d4ed8'), 'light', '--page-top'))
  assert.ok(blue.b > blue.r && blue.b > blue.g)

  const roseDark = hexChannels(cssColor(accentCssCustomProperties('#be123c'), 'dark', '--paper'))
  assert.ok(roseDark.r > roseDark.g && roseDark.r > roseDark.b)

  const gray = hexChannels(cssColor(accentCssCustomProperties('#737373'), 'light', '--paper'))
  assert.ok(Math.abs(gray.r - gray.g) <= 1)
  assert.ok(Math.abs(gray.g - gray.b) <= 1)
})

test('dark panels and the stage take the accent tint', () => {
  const css = accentCssCustomProperties('#6d28d9')
  const stage = hexChannels(cssColor(css, 'light', '--stage-bg'))
  assert.ok(stage.b > stage.g && stage.r > stage.g)
  assert.match(cssColor(css, 'dark', '--panel'), /^rgba\(\d+, \d+, \d+, 0\.78\)$/)
  assert.match(cssColor(css, 'dark', '--stage-bg'), /^#[0-9a-f]{6}$/)
  const review = hexChannels(cssColor(accentCssCustomProperties('#be123c'), 'dark', '--review-bg'))
  assert.ok(review.r > review.g && review.r > review.b)

  const panel = cssColor(css, 'dark', '--panel')
  const channels = panel.match(/rgba\((\d+), (\d+), (\d+),/)
  assert.ok(channels)
  const [, r, g, b] = channels.map(Number)
  assert.ok(b > g && r > g)
})

test('fullWidth defaults off and parses from theme config', () => {
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1' } }).fullWidth, false)
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1', fullWidth: true } }).fullWidth, true)
  assert.equal(parseThemeConfig({ theme: { accent: '#0369a1' }, layout: { fullWidth: true } }).fullWidth, true)
  const payload = themePayload(parseThemeConfig({ theme: { accent: DEFAULT_ACCENT, fullWidth: true } }), 'cfg')
  assert.equal(payload.fullWidth, true)
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

test('saveThemeConfig persists fullWidth beside accent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'live-plan-theme-'))
  const path = join(dir, 'live-plan.config.json')
  await writeFile(path, `${JSON.stringify({ theme: { accent: '#0f766e' }, note: 'keep' }, null, 2)}\n`)
  const saved = await saveThemeConfig(path, {
    accent: '#0369a1',
    fullWidth: true,
    diffsTheme: DEFAULT_DIFFS_THEME,
  })
  assert.deepEqual(saved, { accent: '#0369a1', fullWidth: true, diffsTheme: DEFAULT_DIFFS_THEME })
  const onDisk = JSON.parse(await readFile(path, 'utf8')) as {
    theme: { accent: string; fullWidth: boolean; diffsTheme: string }
    note?: string
  }
  assert.equal(onDisk.theme.accent, '#0369a1')
  assert.equal(onDisk.theme.fullWidth, true)
  assert.equal(onDisk.theme.diffsTheme, DEFAULT_DIFFS_THEME)
  assert.equal(onDisk.note, 'keep')
})

test('saveThemeConfig persists diffsTheme beside accent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'live-plan-diffs-theme-'))
  const path = join(dir, 'live-plan.config.json')
  await writeFile(path, `${JSON.stringify({ theme: { accent: '#0f766e' }, note: 'keep' }, null, 2)}\n`)
  const saved = await saveThemeConfig(path, {
    accent: '#0f766e',
    fullWidth: false,
    diffsTheme: 'soft',
  })
  assert.deepEqual(saved, { accent: '#0f766e', fullWidth: false, diffsTheme: 'soft' })
  const onDisk = JSON.parse(await readFile(path, 'utf8')) as {
    theme: { accent: string; fullWidth: boolean; diffsTheme: string }
    note?: string
  }
  assert.equal(onDisk.theme.diffsTheme, 'soft')
  assert.equal(onDisk.note, 'keep')
})
