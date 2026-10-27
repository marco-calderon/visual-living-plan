import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  defaultConfigHome,
  defaultLogHome,
  defaultRegistryHome,
  globalThemeConfigPath,
  legacyLogHome,
  legacyRegistryHome,
  migrateHomeContents,
} from '../src/configHome.ts'

type EnvSnapshot = {
  HOME?: string
  XDG_CONFIG_HOME?: string
  LIVE_PLAN_HOME?: string
  LIVE_PLAN_LOG_HOME?: string
}

function snapshotEnv(): EnvSnapshot {
  return {
    HOME: process.env.HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    LIVE_PLAN_HOME: process.env.LIVE_PLAN_HOME,
    LIVE_PLAN_LOG_HOME: process.env.LIVE_PLAN_LOG_HOME,
  }
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const key of ['HOME', 'XDG_CONFIG_HOME', 'LIVE_PLAN_HOME', 'LIVE_PLAN_LOG_HOME'] as const) {
    const value = snapshot[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function isolatedHomes(): { root: string; home: string; xdg: string } {
  const root = mkdtempSync(join(tmpdir(), 'live-plan-config-home-'))
  const home = join(root, 'home')
  const xdg = join(root, 'xdg')
  mkdirSync(home, { recursive: true })
  mkdirSync(xdg, { recursive: true })
  process.env.HOME = home
  process.env.XDG_CONFIG_HOME = xdg
  delete process.env.LIVE_PLAN_HOME
  delete process.env.LIVE_PLAN_LOG_HOME
  return { root, home, xdg }
}

function withIsolatedHomes(run: (paths: { root: string; home: string; xdg: string }) => void): void {
  const previous = snapshotEnv()
  const paths = isolatedHomes()
  try {
    run(paths)
  } finally {
    rmSync(paths.root, { recursive: true, force: true })
    restoreEnv(previous)
  }
}

test('default homes use XDG config/living-plan', () => {
  withIsolatedHomes(({ xdg }) => {
    assert.equal(defaultConfigHome(), join(xdg, 'living-plan'))
    assert.equal(defaultRegistryHome(), join(xdg, 'living-plan'))
    assert.equal(defaultLogHome(), join(xdg, 'living-plan', 'logs'))
    assert.equal(globalThemeConfigPath(), join(xdg, 'living-plan', 'live-plan.config.json'))
  })
})

test('LIVE_PLAN_HOME and LIVE_PLAN_LOG_HOME override XDG defaults', () => {
  withIsolatedHomes(({ root }) => {
    const registry = join(root, 'registry-override')
    const logs = join(root, 'log-override')
    process.env.LIVE_PLAN_HOME = registry
    process.env.LIVE_PLAN_LOG_HOME = logs
    assert.equal(defaultRegistryHome(), registry)
    assert.equal(defaultLogHome(), logs)
  })
})

test('idle legacy registry home migrates into XDG', () => {
  withIsolatedHomes(({ home, xdg }) => {
    const legacy = join(home, '.visual-living-plan')
    mkdirSync(join(legacy, 'plans'), { recursive: true })
    writeFileSync(join(legacy, 'registry.sqlite'), 'db')
    // Pick a pid that cannot be alive so migration is allowed.
    writeFileSync(
      join(legacy, 'registry.json'),
      JSON.stringify({
        pid: 2_147_483_647,
        port: 1,
        host: '127.0.0.1',
        url: 'x',
        token: 't',
        startedAt: 1,
      }),
    )
    writeFileSync(join(legacy, 'plans', 'a.plan.md'), '# plan\n')

    const preferred = defaultRegistryHome()
    assert.equal(preferred, join(xdg, 'living-plan'))
    assert.equal(readFileSync(join(preferred, 'registry.sqlite'), 'utf8'), 'db')
    assert.equal(readFileSync(join(preferred, 'plans', 'a.plan.md'), 'utf8'), '# plan\n')
  })
})

test('live legacy registry lock keeps the old home until the process stops', () => {
  withIsolatedHomes(({ home, xdg }) => {
    const legacy = join(home, '.visual-living-plan')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(
      join(legacy, 'registry.json'),
      JSON.stringify({
        pid: process.pid,
        port: 9477,
        host: '127.0.0.1',
        url: 'http://127.0.0.1:9477',
        token: 'token',
        startedAt: Date.now(),
      }),
    )
    writeFileSync(join(legacy, 'registry.sqlite'), 'db')

    assert.equal(defaultRegistryHome(), legacy)
    assert.equal(defaultLogHome(), join(home, '.living-plan'))
    assert.throws(() => readFileSync(join(xdg, 'living-plan', 'registry.sqlite')))
  })
})

test('idle legacy log home migrates into config/logs', () => {
  withIsolatedHomes(({ home, xdg }) => {
    const legacy = join(home, '.living-plan')
    mkdirSync(join(legacy, 'registry'), { recursive: true })
    writeFileSync(join(legacy, 'registry', '2026-10-27.log'), '{"ok":true}\n')

    const preferred = defaultLogHome()
    assert.equal(preferred, join(xdg, 'living-plan', 'logs'))
    assert.equal(readFileSync(join(preferred, 'registry', '2026-10-27.log'), 'utf8'), '{"ok":true}\n')
  })
})

test('migrateHomeContents skips names that already exist at the destination', () => {
  const root = mkdtempSync(join(tmpdir(), 'live-plan-migrate-'))
  try {
    const from = join(root, 'from')
    const to = join(root, 'to')
    mkdirSync(from, { recursive: true })
    mkdirSync(to, { recursive: true })
    writeFileSync(join(from, 'a'), 'new-a')
    writeFileSync(join(from, 'b'), 'new-b')
    writeFileSync(join(to, 'a'), 'keep-a')
    migrateHomeContents(from, to)
    assert.equal(readFileSync(join(to, 'a'), 'utf8'), 'keep-a')
    assert.equal(readFileSync(join(to, 'b'), 'utf8'), 'new-b')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('legacy path helpers stay under HOME', () => {
  withIsolatedHomes(({ home }) => {
    assert.equal(legacyRegistryHome(), join(home, '.visual-living-plan'))
    assert.equal(legacyLogHome(), join(home, '.living-plan'))
  })
})
