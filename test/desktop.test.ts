import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { isPidAlive } from '../src/pid.ts'
import { readRegistryLock } from '../src/registryLock.ts'
import {
  parseHostTriple,
  SERVICE_ASSETS,
  servicePackageJson,
  sidecarFileName,
} from '../scripts/build-desktop.ts'
import { DESKTOP_SCHEME } from '../src/desktopApp.ts'

const root = resolve(import.meta.dir, '..')
const tauriConfig = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolvePort(port))
    })
  })
}

test('the staged runtime has the name tauri.conf.json bundles', () => {
  assert.deepEqual(tauriConfig.bundle.externalBin, ['binaries/living-plan-bun'])
  assert.equal(sidecarFileName('x86_64-unknown-linux-gnu'), 'living-plan-bun-x86_64-unknown-linux-gnu')
  assert.equal(sidecarFileName('aarch64-apple-darwin'), 'living-plan-bun-aarch64-apple-darwin')
  assert.equal(sidecarFileName('x86_64-pc-windows-msvc'), 'living-plan-bun-x86_64-pc-windows-msvc.exe')
})

test('the app ships the staged service and takes its version from package.json', () => {
  assert.deepEqual(tauriConfig.bundle.resources, { 'service/': 'service/' })
  assert.equal(tauriConfig.version, '../package.json')
  assert.equal(tauriConfig.build.beforeBuildCommand, 'bun run desktop:stage')
  assert.equal(pkg.scripts['desktop:stage'], 'bun scripts/build-desktop.ts')
})

test('the app registers the scheme the CLI opens, and ships for macOS', () => {
  assert.deepEqual(tauriConfig.plugins['deep-link'].desktop.schemes, [DESKTOP_SCHEME])
  assert.deepEqual(tauriConfig.bundle.targets, ['app', 'dmg'])
  // The bundled Bun's own minimum.
  assert.equal(tauriConfig.bundle.macOS.minimumSystemVersion, '13.0')
})

test('the signed app keeps the entitlements Bun needs for its JIT', () => {
  assert.equal(tauriConfig.bundle.macOS.entitlements, './Entitlements.plist')
  const entitlements = readFileSync(join(root, 'src-tauri/Entitlements.plist'), 'utf8')
  for (const key of [
    'com.apple.security.cs.allow-jit',
    'com.apple.security.cs.allow-unsigned-executable-memory',
    'com.apple.security.cs.disable-executable-page-protection',
    'com.apple.security.cs.allow-dyld-environment-variables',
    'com.apple.security.cs.disable-library-validation',
  ]) {
    assert.match(entitlements, new RegExp(`<key>${key.replaceAll('.', '\\.')}</key>\\s*<true/>`), key)
  }
})

test('the host triple comes from rustc -vV', () => {
  const output = 'rustc 1.97.0 (2d8144b78 2026-07-07)\nbinary: rustc\nhost: aarch64-apple-darwin\nrelease: 1.97.0\n'
  assert.equal(parseHostTriple(output), 'aarch64-apple-darwin')
  assert.equal(parseHostTriple('rustc 1.97.0'), null)
})

test('the staged package.json carries the version the service reports', () => {
  const staged = servicePackageJson(pkg)
  assert.equal(staged.version, pkg.version)
  assert.equal(staged.name, 'visual-living-plan')
  assert.equal(staged.type, 'module')
})

test('every file the staged service reads exists after a build, except the build output itself', () => {
  for (const [from, to] of SERVICE_ASSETS) {
    assert.equal(from, to, 'the service looks for each file at the same path relative to dist/cli.js')
    if (from.startsWith('dist/')) continue
    assert.equal(existsSync(join(root, from)), true, `${from} is missing`)
  }
})

test('the CLI bundles into one file that runs from beside a package.json', async () => {
  const stage = await mkdtemp(join(tmpdir(), 'live-plan-desktop-'))
  try {
    const bundle = await Bun.build({
      entrypoints: [join(root, 'src/cli.ts')],
      target: 'bun',
      outdir: join(stage, 'dist'),
      naming: 'cli.js',
    })
    assert.equal(bundle.success, true, bundle.logs.join('\n'))
    await writeFile(join(stage, 'package.json'), JSON.stringify(servicePackageJson(pkg)))
    // `src/render.ts` reads the plan styles beside itself when it loads.
    await copyFile(join(root, 'src/planPage.css'), join(stage, 'dist/planPage.css'))
    const result = spawnSync(process.execPath, [join(stage, 'dist/cli.js'), '--version'], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), pkg.version)
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
})

test('dashboard --json --any-version prints the address the desktop app opens', async () => {
  const home = await mkdtemp(join(tmpdir(), 'live-plan-desktop-home-'))
  const port = await freePort()
  try {
    const result = spawnSync(
      process.execPath,
      [join(root, 'src/cli.ts'), 'dashboard', '--json', '--any-version', '--registry-port', String(port)],
      { encoding: 'utf8', env: { ...process.env, LIVE_PLAN_HOME: home, LIVE_PLAN_LOG_HOME: join(home, 'logs') } },
    )
    assert.equal(result.status, 0, result.stderr)
    const lines = result.stdout.trim().split('\n')
    const printed = JSON.parse(lines[lines.length - 1] ?? '')
    assert.deepEqual(printed, {
      url: `http://127.0.0.1:${port}/dashboard`,
      service: `http://127.0.0.1:${port}`,
      version: pkg.version,
    })
    const page = await fetch(printed.url)
    assert.equal(page.status, 200)
  } finally {
    const lock = await readRegistryLock(home)
    if (lock && isPidAlive(lock.pid)) {
      process.kill(lock.pid, 'SIGTERM')
      const started = Date.now()
      while (isPidAlive(lock.pid) && Date.now() - started < 5_000) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
      }
    }
    await rm(home, { recursive: true, force: true })
  }
})
