import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DIFFS_THEMES,
  diffsThemeLabel,
  diffsThemePair,
  diffsThemesForMode,
  diffsThemeWith,
  isKnownDiffsTheme,
  normalizeDiffsTheme,
} from '../src/diffsTheme.ts'
import { mergeAccountSettings } from '../src/host/accountSettings.ts'
import { parseThemeConfig, themePayload } from '../src/theme.ts'

test('the catalog lists Pierre and Shiki themes for both modes with preview colors', () => {
  assert.ok(DIFFS_THEMES.length > 60)
  assert.equal(new Set(DIFFS_THEMES.map((entry) => entry.name)).size, DIFFS_THEMES.length)
  for (const mode of ['light', 'dark'] as const) {
    const entries = diffsThemesForMode(mode)
    assert.ok(entries.some((entry) => entry.group === 'pierre'))
    assert.ok(entries.some((entry) => entry.group === 'shiki'))
    for (const entry of entries) {
      for (const color of Object.values(entry.sample)) assert.match(color, /^#[0-9a-f]{6}$/)
    }
  }
})

test('a light and dark pair saves as light/dark and maps back to a family when it matches one', () => {
  assert.equal(normalizeDiffsTheme('github-light/github-dark'), 'github-light/github-dark')
  assert.deepEqual(diffsThemePair('github-light/github-dark'), { light: 'github-light', dark: 'github-dark' })
  assert.equal(normalizeDiffsTheme('pierre-light-soft/pierre-dark-soft'), 'soft')
  assert.equal(diffsThemeLabel('github-light/dracula'), 'GitHub Light · Dracula Theme')
  assert.equal(diffsThemeLabel('soft'), 'Soft')
})

test('a pair must name a light theme then a dark theme from the catalog', () => {
  assert.equal(isKnownDiffsTheme('github-dark/github-light'), false)
  assert.equal(isKnownDiffsTheme('github-light/not-a-theme'), false)
  assert.equal(isKnownDiffsTheme('github-light'), false)
  assert.equal(normalizeDiffsTheme('github-dark/github-light'), 'pierre')
})

test('choosing a theme for one mode keeps the other mode', () => {
  assert.equal(diffsThemeWith('pierre', 'dark', 'tokyo-night'), 'pierre-light/tokyo-night')
  assert.equal(diffsThemeWith('pierre-light/tokyo-night', 'light', 'one-light'), 'one-light/tokyo-night')
  assert.equal(diffsThemeWith('pierre-light/tokyo-night', 'dark', 'pierre-dark'), 'pierre')
  // A theme from the other mode is ignored.
  assert.equal(diffsThemeWith('soft', 'light', 'dracula'), 'soft')
})

test('theme config and account settings keep a custom pair', () => {
  const config = parseThemeConfig({ theme: { accent: '#0369a1', diffsTheme: 'catppuccin-latte/catppuccin-mocha' } })
  assert.equal(config.diffsTheme, 'catppuccin-latte/catppuccin-mocha')
  assert.deepEqual(themePayload(config, '/tmp/live-plan.config.json').diffsThemePair, {
    light: 'catppuccin-latte',
    dark: 'catppuccin-mocha',
  })
  const current = { accent: '#0f766e', pageWidth: 'default' as const, diffsTheme: 'pierre', wrapCode: false }
  assert.equal(mergeAccountSettings(current, { diffsTheme: 'rose-pine-dawn/rose-pine' }).diffsTheme, 'rose-pine-dawn/rose-pine')
  assert.equal(mergeAccountSettings(current, { diffsTheme: 'nope/nope' }).diffsTheme, 'pierre')
})
