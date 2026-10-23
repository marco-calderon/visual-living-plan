import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deriveAccentVars } from '../src/theme.ts'
import { planRowKey, uniqueRowKeys } from '../src/tui/dashboardView.ts'
import { createPalette } from '../src/tui/palette.ts'
import { processRowKey } from '../src/tui/registryView.ts'
import {
  colorModeFromColorfgbg,
  colorModeFromGnomeColorScheme,
  colorModeFromGtkSettings,
  colorModeFromKdeGlobals,
  colorModeFromThemeName,
  resolveSystemColorMode,
  systemColorMode,
  type SystemThemeSources,
} from '../src/tui/systemTheme.ts'
import { DashboardApp } from '../src/tui/DashboardApp.tsx'
import type { PlanRecord } from '../src/processRecord.ts'

function sources(overrides: Partial<SystemThemeSources> = {}): SystemThemeSources {
  return {
    platform: 'linux',
    env: {},
    home: '/home/dev',
    command() {
      return null
    },
    readText() {
      return null
    },
    ...overrides,
  }
}

test('palette accent comes from the theme for the active color mode', () => {
  const light = createPalette('light', '#be123c')
  const dark = createPalette('dark', '#be123c')
  assert.equal(light.accent, deriveAccentVars('#be123c', 'light').accent)
  assert.equal(light.onAccent, deriveAccentVars('#be123c', 'light').onAccent)
  assert.equal(dark.accent, deriveAccentVars('#be123c', 'dark').accent)
  assert.equal(dark.onAccent, deriveAccentVars('#be123c', 'dark').onAccent)
  assert.equal(light.accent, '#be123c')
  assert.notEqual(dark.accent, light.accent)
  assert.equal(light.paper, '#f3f6f3')
  assert.equal(dark.paper, '#101816')
  assert.notEqual(light.accentSoft, dark.accentSoft)
  assert.match(light.accentSoft, /^#[0-9a-f]{6}$/)
  assert.match(dark.hover, /^#[0-9a-f]{6}$/)
})

test('system theme prefers the desktop color scheme over the terminal hint', () => {
  assert.equal(colorModeFromGnomeColorScheme("'prefer-dark'"), 'dark')
  assert.equal(colorModeFromGnomeColorScheme('prefer-light'), 'light')
  assert.equal(colorModeFromGnomeColorScheme("'default'"), null)
  assert.equal(colorModeFromThemeName('Adwaita-dark'), 'dark')
  assert.equal(colorModeFromThemeName('WhiteSur-Light'), 'light')
  assert.equal(colorModeFromThemeName('Adwaita'), null)
  assert.equal(
    colorModeFromGtkSettings('gtk-application-prefer-dark-theme=0\ngtk-theme-name=WhiteSur-Light\n'),
    'light',
  )
  assert.equal(colorModeFromGtkSettings('gtk-theme-name=Yaru-dark\n'), 'dark')
  assert.equal(colorModeFromKdeGlobals('[General]\nColorScheme=BreezeDark\n'), 'dark')
  assert.equal(colorModeFromColorfgbg('15;0'), 'dark')
  assert.equal(colorModeFromColorfgbg('0;15'), 'light')
  assert.equal(colorModeFromColorfgbg('0;7'), 'light')

  const darkDesktop = resolveSystemColorMode(
    sources({
      env: { COLORFGBG: '0;15' },
      command(name, args) {
        if (name === 'gsettings' && args.at(-1) === 'color-scheme') return { ok: true, stdout: "'prefer-dark'\n" }
        return null
      },
    }),
  )
  assert.equal(darkDesktop, 'dark')

  const fromTerminal = resolveSystemColorMode(sources({ env: { COLORFGBG: '0;15' } }))
  assert.equal(fromTerminal, 'light')

  const fromGtkFile = resolveSystemColorMode(
    sources({
      readText(path) {
        if (path.endsWith('gtk-3.0/settings.ini')) return 'gtk-application-prefer-dark-theme=1\n'
        return null
      },
    }),
  )
  assert.equal(fromGtkFile, 'dark')

  const macDark = resolveSystemColorMode(
    sources({
      platform: 'darwin',
      command() {
        return { ok: true, stdout: 'Dark\n' }
      },
    }),
  )
  assert.equal(macDark, 'dark')

  const macLight = resolveSystemColorMode(
    sources({
      platform: 'darwin',
      env: { COLORFGBG: '15;0' },
      command() {
        return { ok: false, stdout: '' }
      },
    }),
  )
  assert.equal(macLight, 'light')
})

test('reading the machine color mode returns light or dark', () => {
  const mode = systemColorMode()
  assert.ok(mode === 'light' || mode === 'dark')
})

test('dashboard rows that share a plan id get distinct keys', () => {
  const plan = {
    id: 'same',
    status: 'executed' as const,
    startedAt: 10,
    endedAt: 20,
  }
  const keys = uniqueRowKeys([plan, plan, { ...plan, startedAt: 30 }], planRowKey)
  assert.equal(new Set(keys).size, keys.length)
  assert.equal(keys[0], planRowKey(plan))
  assert.notEqual(keys[0], keys[1])
  assert.equal(keys[2], planRowKey({ ...plan, startedAt: 30 }))
  assert.equal(processRowKey({ id: 'same', startedAt: 10, pid: 4 }), 'same:10:4')
})

function samplePlan(id: string, startedAt: number): PlanRecord {
  return {
    id,
    pid: 1,
    title: `Plan ${id}`,
    summary: null,
    agent: null,
    mode: 'watch',
    status: 'executed',
    planPath: `/tmp/${id}.plan.md`,
    storedPath: `/tmp/${id}.plan.md`,
    directory: '/tmp/work',
    cwd: '/tmp',
    url: 'http://127.0.0.1:9/plans/x/',
    host: '127.0.0.1',
    port: 9,
    startedAt,
    endedAt: startedAt + 1_000,
    heartbeatAt: startedAt + 1_000,
    durationMs: 1_000,
    pendingCount: 0,
    phaseTotal: 1,
    phaseDone: 1,
    interactionTotal: 0,
    interactionDone: 0,
    completionRatio: 100,
    completionState: 'complete',
    executionActive: false,
    executionStep: null,
    filesModified: 0,
    outcome: null,
    git: {
      isRepo: false,
      root: null,
      branch: null,
      commit: null,
      dirty: false,
      ahead: 0,
      behind: 0,
      changedFiles: 0,
      changedPaths: [],
      summary: '',
    },
  }
}

test('tui paints the theme accent and does not warn about duplicate keys', { timeout: 20_000 }, async () => {
  const plans = [samplePlan('same', 1), samplePlan('same', 1), samplePlan('same', 5)]
  const payload = {
    summary: {
      period: 'day' as const,
      label: 'Today',
      from: 0,
      to: Date.now(),
      plans: plans.length,
      started: plans.length,
      running: 0,
      executed: plans.length,
      interrupted: 0,
      filesModified: 0,
      durationMs: 3_000,
      folders: 1,
    },
    plans,
  }
  let output = ''
  const terminal = new Bun.Terminal({
    cols: 100,
    rows: 48,
    data(_term, data) {
      output += new TextDecoder().decode(data)
    },
  })
  const proc = Bun.spawn(
    [
      process.execPath,
      '-e',
      `import { render } from '@semos-labs/glyph'
import { createElement } from 'react'
import { DashboardApp } from './src/tui/DashboardApp.tsx'
const plans = ${JSON.stringify(plans)}
const payload = ${JSON.stringify(payload)}
render(createElement(DashboardApp, {
  registryUrl: 'http://127.0.0.1:9',
  accent: '#be123c',
  colorMode: 'dark',
  read: async () => payload,
  readRunning: async () => plans,
  openUrl: () => {},
  refreshMs: 60000,
  onQuit: () => process.exit(0),
}))
`,
    ],
    { cwd: process.cwd(), terminal },
  )
  const started = Date.now()
  while (Date.now() - started < 8_000 && !output.includes('Plan same')) {
    await Bun.sleep(50)
  }
  await Bun.sleep(300)
  terminal.write('q')
  await Promise.race([proc.exited, Bun.sleep(3_000)])
  try {
    terminal.close()
  } catch {
    // The PTY is already closed.
  }

  assert.equal(output.includes('same key'), false)
  assert.equal(output.includes('Invalid hook call'), false)
  assert.match(output, /3 plans active/)
  assert.match(output, /Plan same/)
  const accent = deriveAccentVars('#be123c', 'dark').accent
  const red = Number.parseInt(accent.slice(1, 3), 16)
  const green = Number.parseInt(accent.slice(3, 5), 16)
  const blue = Number.parseInt(accent.slice(5, 7), 16)
  assert.match(output, new RegExp(`38;2;${red};${green};${blue}`))
  assert.match(output, /48;2;16;24;22/)
})
