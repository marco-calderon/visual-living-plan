import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { AGENT_HARNESSES, bundledSkillDir, harnessStatuses, installSkill } from '../src/agentSkills.ts'
import { installLauncher, LAUNCHER_MARK, launcherScript, launcherStatus, type LauncherEnv } from '../src/cliLauncher.ts'
import {
  defaultDesktopConfig,
  mergeDesktopConfig,
  normalizeCloudUrl,
  parseDesktopConfig,
  readDesktopConfig,
  writeDesktopConfig,
} from '../src/desktopConfig.ts'
import { pendingDesktopAppearance } from '../src/desktopBridge.ts'
import { desktopModeSwitchHtml } from '../src/hostToolbar.ts'
import { DesktopModeSwitch } from '../src/DesktopModeSwitch.tsx'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadThemeConfig } from '../src/theme.ts'

const root = resolve(import.meta.dir, '..')

async function temp(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'live-plan-setup-'))
}

test('a cloud host is an https origin, or loopback http for development', () => {
  assert.equal(normalizeCloudUrl('plans.example.com'), 'https://plans.example.com')
  assert.equal(normalizeCloudUrl(' https://plans.example.com/dashboard?x=1 '), 'https://plans.example.com')
  assert.equal(normalizeCloudUrl('http://127.0.0.1:8787/'), 'http://127.0.0.1:8787')
  assert.throws(() => normalizeCloudUrl('http://plans.example.com'), /https/)
  assert.throws(() => normalizeCloudUrl('https://me:secret@plans.example.com'), /user name/)
  assert.throws(() => normalizeCloudUrl('file:///etc/passwd'), /https/)
  assert.throws(() => normalizeCloudUrl('   '), /address/)
})

test('a stored config falls back field by field', () => {
  assert.deepEqual(parseDesktopConfig(null), defaultDesktopConfig())
  assert.deepEqual(parseDesktopConfig({ mode: 'cloud', colorMode: 'sepia', setupDone: 'yes' }), defaultDesktopConfig())
  const stored = parseDesktopConfig({
    setupDone: true,
    mode: 'cloud',
    cloudUrl: 'https://plans.example.com/',
    colorMode: 'dark',
    appearance: { accent: '#6D28D9', diffsTheme: 'soft', savedAt: 5 },
  })
  assert.equal(stored.mode, 'cloud')
  assert.equal(stored.cloudUrl, 'https://plans.example.com')
  assert.equal(stored.colorMode, 'dark')
  assert.deepEqual(stored.appearance, { accent: '#6d28d9', diffsTheme: 'soft', savedAt: 5 })
})

test('setup changes are checked before they are saved', () => {
  const start = defaultDesktopConfig()
  assert.throws(() => mergeDesktopConfig(start, { mode: 'cloud' }), /address of the cloud host/)
  assert.throws(() => mergeDesktopConfig(start, { mode: 'elsewhere' }), /local or cloud/)
  assert.throws(() => mergeDesktopConfig(start, { colorMode: 'sepia' }), /colorMode/)
  assert.throws(() => mergeDesktopConfig(start, { accent: 'purple', diffsTheme: 'soft' }), /accent/)
  assert.throws(() => mergeDesktopConfig(start, { accent: '#6d28d9', diffsTheme: 'nope' }), /syntax theme/)

  const cloud = mergeDesktopConfig(start, { mode: 'cloud', cloudUrl: 'plans.example.com', setupDone: true })
  assert.deepEqual([cloud.mode, cloud.cloudUrl, cloud.setupDone], ['cloud', 'https://plans.example.com', true])
  // The host the CLI is signed in to stands in when setup names none.
  assert.equal(mergeDesktopConfig(start, { mode: 'cloud' }, { fallbackCloudUrl: 'https://signed.example.com' }).cloudUrl, 'https://signed.example.com')
  // Clearing the host of a cloud config returns it to local.
  assert.equal(mergeDesktopConfig(cloud, { cloudUrl: '' }).mode, 'local')

  const look = mergeDesktopConfig(start, { accent: '#6d28d9', diffsTheme: 'soft', colorMode: 'dark' }, { now: 42 })
  assert.deepEqual(look.appearance, { accent: '#6d28d9', diffsTheme: 'soft', savedAt: 42 })
  assert.equal(look.colorMode, 'dark')
  // One half of the look alone keeps the other half.
  assert.deepEqual(mergeDesktopConfig(look, { accent: '#be123c' }, { now: 43 }).appearance, { accent: '#be123c', diffsTheme: 'soft', savedAt: 43 })
  assert.equal(mergeDesktopConfig(start, { colorMode: 'light' }).appearance, null)
})

test('the config round-trips through desktop.json', async () => {
  const home = await temp()
  try {
    assert.deepEqual(await readDesktopConfig(home), defaultDesktopConfig())
    const config = mergeDesktopConfig(defaultDesktopConfig(), { mode: 'cloud', cloudUrl: 'https://plans.example.com', setupDone: true })
    await writeDesktopConfig(config, home)
    assert.deepEqual(await readDesktopConfig(home), config)
    await writeFile(join(home, 'desktop.json'), '{broken')
    assert.deepEqual(await readDesktopConfig(home), defaultDesktopConfig())
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('the skill installs into the harnesses found, and only replaces its own folder', async () => {
  const home = await temp()
  try {
    assert.equal(existsSync(join(bundledSkillDir(), 'SKILL.md')), true, 'the package ships skills/live-plan')
    await mkdir(join(home, '.claude', 'skills', 'other-skill'), { recursive: true })
    await writeFile(join(home, '.claude', 'skills', 'other-skill', 'SKILL.md'), 'mine')
    await mkdir(join(home, '.codex', 'skills', 'live-plan'), { recursive: true })
    await writeFile(join(home, '.codex', 'skills', 'live-plan', 'SKILL.md'), 'an older copy')

    const before = await harnessStatuses({ home })
    assert.deepEqual(before.map((status) => status.id), AGENT_HARNESSES.map((harness) => harness.id))
    assert.deepEqual(before.filter((status) => status.detected).map((status) => status.id), ['claude-code', 'codex'])
    const codex = before.find((status) => status.id === 'codex')
    assert.deepEqual([codex?.installed, codex?.current], [true, false])

    const installed = await installSkill([], { home })
    assert.deepEqual(installed.map((status) => [status.id, status.current]), [['claude-code', true], ['codex', true]])
    assert.equal(await readFile(join(home, '.claude', 'skills', 'other-skill', 'SKILL.md'), 'utf8'), 'mine')
    assert.equal(existsSync(join(home, '.cursor')), false, 'a harness that is not on the machine is left alone')

    const named = await installSkill(['cursor'], { home })
    assert.equal(named[0]?.path, join(home, '.cursor', 'skills', 'live-plan'))
    assert.equal(existsSync(join(home, '.cursor', 'skills', 'live-plan', 'SKILL.md')), true)
    await assert.rejects(installSkill(['notepad'], { home }), /Unknown harness/)
    await assert.rejects(installSkill([], { home, source: join(home, 'missing') }), /missing from this install/)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('the launcher goes into a folder on the PATH and runs this install', async () => {
  const home = await temp()
  try {
    const bin = join(home, '.local', 'bin')
    await mkdir(bin, { recursive: true })
    const entry = join(root, 'src', 'cli.ts')
    const target = { runtime: process.execPath, entry }
    const env: LauncherEnv = { platform: process.platform, home, path: ['/usr/bin', bin] }

    const before = launcherStatus(target, env)
    assert.deepEqual([before.installed, before.present, before.path, before.onPath], [false, false, join(bin, 'live-plan'), true])

    const status = await installLauncher(target, env)
    assert.deepEqual([status.installed, status.present, status.other, status.hint], [true, true, null, null])
    assert.match(readFileSync(join(bin, 'live-plan'), 'utf8'), new RegExp(LAUNCHER_MARK))
    assert.equal(existsSync(join(bin, 'visual-living-plan')), true)
    if (process.platform !== 'win32') {
      const run = spawnSync(join(bin, 'live-plan'), ['--version'], { encoding: 'utf8' })
      assert.equal(run.status, 0, run.stderr)
      assert.match(run.stdout.trim(), /^\d+\.\d+\.\d+$/)
    }

    // The app moved: the launcher is ours but runs the old copy.
    const moved = launcherStatus({ runtime: process.execPath, entry: join(home, 'elsewhere', 'cli.js') }, env)
    assert.deepEqual([moved.installed, moved.stale], [false, true])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('a live-plan that something else installed is never replaced', async () => {
  const home = await temp()
  try {
    const npmBin = join(home, 'npm', 'bin')
    await mkdir(npmBin, { recursive: true })
    await writeFile(join(npmBin, 'live-plan'), '#!/bin/sh\necho from npm\n')
    await chmod(join(npmBin, 'live-plan'), 0o755)
    const target = { runtime: process.execPath, entry: join(root, 'src', 'cli.ts') }
    const env: LauncherEnv = { platform: 'linux', home, path: [npmBin] }
    assert.equal(launcherStatus(target, env).other, join(npmBin, 'live-plan'))
    await assert.rejects(installLauncher(target, env), /already installed/)
    assert.equal(readFileSync(join(npmBin, 'live-plan'), 'utf8'), '#!/bin/sh\necho from npm\n')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('with no writable folder on the PATH the launcher goes to ~/.local/bin with a hint', async () => {
  const home = await temp()
  try {
    const target = { runtime: process.execPath, entry: join(root, 'src', 'cli.ts') }
    const env: LauncherEnv = { platform: 'darwin', home, path: ['/usr/bin', '/bin'] }
    const status = await installLauncher(target, env)
    assert.equal(status.path, join(home, '.local', 'bin', 'live-plan'))
    assert.deepEqual([status.installed, status.present, status.onPath], [false, true, false])
    assert.equal(status.hint, 'export PATH="$HOME/.local/bin:$PATH"')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('the launcher quotes a path with spaces and quotes', () => {
  const script = launcherScript({ runtime: "/Applications/Living Plan.app/Contents/MacOS/living-plan-bun", entry: "/tmp/it's/cli.js" }, 'darwin')
  assert.match(script, /^#!\/bin\/sh\n/)
  assert.match(script, /exec '\/Applications\/Living Plan\.app\/Contents\/MacOS\/living-plan-bun' '\/tmp\/it'\\''s\/cli\.js' "\$@"\n$/)
  assert.match(launcherScript({ runtime: 'C:\\bun.exe', entry: 'C:\\cli.js' }, 'win32'), /"C:\\bun\.exe" "C:\\cli\.js" %\*/)
})

test('a plan with no theme file beside it starts from the machine-wide one', async () => {
  const home = await temp()
  try {
    const global = join(home, 'live-plan.config.json')
    const beside = join(home, 'plan', 'live-plan.config.json')
    assert.equal((await loadThemeConfig(beside, global)).accent, '#0f766e')
    await writeFile(global, JSON.stringify({ theme: { accent: '#6d28d9', diffsTheme: 'soft' } }))
    const inherited = await loadThemeConfig(beside, global)
    assert.deepEqual([inherited.accent, inherited.diffsTheme], ['#6d28d9', 'soft'])
    await mkdir(join(home, 'plan'))
    await writeFile(beside, JSON.stringify({ theme: { accent: '#be123c' } }))
    assert.equal((await loadThemeConfig(beside, global)).accent, '#be123c')
    await writeFile(global, '{broken')
    await rm(beside)
    assert.equal((await loadThemeConfig(beside, global)).accent, '#0f766e')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('the toolbar switch links to the other side only', () => {
  const local = desktopModeSwitchHtml('local')
  assert.match(local, /<span aria-current="true" aria-label="Local" title="Local"><svg /)
  assert.match(local, /<a href="living-plan:\/\/switch\/cloud" aria-label="Cloud" title="Cloud"><svg /)
  assert.doesNotMatch(local, /switch\/local/)
  const cloud = desktopModeSwitchHtml('cloud')
  assert.match(cloud, /<a href="living-plan:\/\/switch\/local" aria-label="Local" title="Local"><svg /)
  assert.match(cloud, /<span aria-current="true" aria-label="Cloud" title="Cloud"><svg /)
})

test('the React toolbar switch draws the same markup as the HTML one', () => {
  for (const host of ['local', 'cloud'] as const) {
    assert.equal(renderToStaticMarkup(createElement(DesktopModeSwitch, { host })), desktopModeSwitchHtml(host))
  }
})

test('a hosted page saves the setup look once per choice', () => {
  const info = { platform: 'macos', chrome: 'overlay', appearance: { accent: '#6d28d9', diffsTheme: 'soft', savedAt: 10 } }
  assert.deepEqual(pendingDesktopAppearance(info, 0), info.appearance)
  assert.equal(pendingDesktopAppearance(info, 10), null)
  assert.equal(pendingDesktopAppearance({ platform: 'macos', chrome: 'overlay' }, 0), null)
  assert.equal(pendingDesktopAppearance(null, 0), null)
  assert.equal(pendingDesktopAppearance({ ...info, appearance: { accent: 1 } as never }, 0), null)
})

test('desktop state, configure, and skills run from the CLI', async () => {
  const home = await temp()
  try {
    await mkdir(join(home, '.claude'), { recursive: true })
    const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, 'config'), LIVE_PLAN_HOME: join(home, 'config', 'living-plan'), SHELL: '', PATH: process.env.PATH }
    const cli = (...args: string[]) => spawnSync(process.execPath, [join(root, 'src', 'cli.ts'), ...args], { encoding: 'utf8', env })

    const first = cli('desktop', 'state')
    assert.equal(first.status, 0, first.stderr)
    const state = JSON.parse(first.stdout.trim().split('\n').at(-1) ?? '')
    assert.deepEqual(state.config, defaultDesktopConfig())
    assert.equal(state.cloudUrl, null)
    assert.equal(state.accents.length, 8)
    assert.equal(state.syntaxThemes[0].id, 'pierre')
    assert.deepEqual(state.harnesses.filter((harness: { detected: boolean }) => harness.detected).map((harness: { id: string }) => harness.id), ['claude-code'])

    const refused = cli('desktop', 'configure', '--json', '{"mode":"cloud"}')
    assert.equal(refused.status, 1)
    assert.match(refused.stderr, /address of the cloud host/)

    const saved = cli('desktop', 'configure', '--json', JSON.stringify({ mode: 'cloud', cloudUrl: 'plans.example.com', accent: '#6d28d9', diffsTheme: 'soft', setupDone: true }))
    assert.equal(saved.status, 0, saved.stderr)
    const next = JSON.parse(saved.stdout.trim().split('\n').at(-1) ?? '')
    assert.deepEqual([next.config.mode, next.cloudUrl, next.config.setupDone], ['cloud', 'https://plans.example.com', true])
    // The look is also the machine-wide theme, so local plans start with it.
    assert.deepEqual(next.theme, { accent: '#6d28d9', diffsTheme: 'soft' })

    const skills = cli('skills', 'install', '--json')
    assert.equal(skills.status, 0, skills.stderr)
    assert.deepEqual(JSON.parse(skills.stdout.trim()).map((status: { id: string; current: boolean }) => [status.id, status.current]), [['claude-code', true]])
    assert.equal(existsSync(join(home, '.claude', 'skills', 'live-plan', 'SKILL.md')), true)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
