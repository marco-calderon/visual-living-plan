import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appLaunchArgs, chromiumAppId, findInstalledApp, manifestIdFor } from '../src/openUrl.ts'

const planUrl = 'http://127.0.0.1:9477/plans/abc/'

test('the manifest id is the page origin plus the manifest id path', () => {
  assert.equal(manifestIdFor(planUrl), 'http://127.0.0.1:9477/')
  assert.equal(manifestIdFor('https://plans.example.com/plans/x/?mode=review#top'), 'https://plans.example.com/')
  assert.equal(manifestIdFor('file:///tmp/plan.md'), null)
  assert.equal(manifestIdFor('not a url'), null)
})

test('the app id is 32 letters from a to p and depends on the origin', () => {
  const id = chromiumAppId('http://127.0.0.1:9477/')
  assert.match(id, /^[a-p]{32}$/)
  assert.equal(chromiumAppId('http://127.0.0.1:9477/'), id)
  assert.notEqual(chromiumAppId('http://localhost:9477/'), id)
})

test('the app id matches the id Chromium gave a real install', () => {
  // Installed from http://127.0.0.1:9555/ with manifest id "/" in Chromium 1243.
  assert.equal(chromiumAppId('http://127.0.0.1:9555/'), 'mklipcpnommhakakchhbjhpfjfndopel')
})

function fakeMachine() {
  const root = mkdtempSync(join(tmpdir(), 'open-url-'))
  const home = join(root, 'home')
  const bin = join(root, 'bin')
  mkdirSync(bin, { recursive: true })
  const chrome = join(bin, 'google-chrome')
  writeFileSync(chrome, '#!/bin/sh\n')
  chmodSync(chrome, 0o755)
  const userData = join(home, '.config', 'google-chrome')
  const install = (profile: string, url = planUrl) =>
    mkdirSync(join(userData, profile, 'Web Applications', 'Manifest Resources', chromiumAppId(manifestIdFor(url)!)), {
      recursive: true,
    })
  const target = { platform: 'linux' as const, env: { PATH: bin }, home }
  return { root, chrome, userData, install, target }
}

test('an installed app is found in the browser profile that installed it', () => {
  const machine = fakeMachine()
  try {
    mkdirSync(join(machine.userData, 'Default'), { recursive: true })
    machine.install('Profile 2')
    const app = findInstalledApp(planUrl, machine.target)
    assert.ok(app)
    assert.equal(app.browser, 'Chrome')
    assert.equal(app.binary, machine.chrome)
    assert.equal(app.profile, 'Profile 2')
    assert.deepEqual(appLaunchArgs(app, planUrl), [
      '--profile-directory=Profile 2',
      `--app-id=${app.appId}`,
      `--app-launch-url-for-shortcuts-menu-item=${planUrl}`,
    ])
  } finally {
    rmSync(machine.root, { recursive: true, force: true })
  }
})

test('the Default profile wins when several profiles installed the app', () => {
  const machine = fakeMachine()
  try {
    machine.install('Profile 1')
    machine.install('Default')
    assert.equal(findInstalledApp(planUrl, machine.target)?.profile, 'Default')
  } finally {
    rmSync(machine.root, { recursive: true, force: true })
  }
})

test('no app means a browser tab', () => {
  const machine = fakeMachine()
  try {
    mkdirSync(join(machine.userData, 'Default'), { recursive: true })
    assert.equal(findInstalledApp(planUrl, machine.target), null)
    // Installed from another origin only.
    machine.install('Default', 'http://localhost:9477/')
    assert.equal(findInstalledApp(planUrl, machine.target), null)
  } finally {
    rmSync(machine.root, { recursive: true, force: true })
  }
})

test('an installed app without its browser on PATH means a browser tab', () => {
  const machine = fakeMachine()
  try {
    machine.install('Default')
    assert.equal(findInstalledApp(planUrl, { ...machine.target, env: { PATH: '' } }), null)
  } finally {
    rmSync(machine.root, { recursive: true, force: true })
  }
})
