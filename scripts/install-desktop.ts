#!/usr/bin/env bun
/**
 * Build the Mac app for this machine and install it (`bun run desktop:install`).
 *
 *   1. `bun run desktop:build -- --target <host triple> --bundles app` (stages the service first).
 *   2. Quits a running Living Plan, then replaces /Applications/Living Plan.app with the new build.
 *   3. Checks the ad hoc signature, registers the app with Launch Services so `living-plan://`
 *      links open this copy, and launches it.
 *
 * --dmg            Also build the .dmg.
 * --no-launch      Install without opening the app.
 * --dest DIR       Install into DIR instead of /Applications (LIVE_PLAN_DESKTOP_DEST also works).
 * --skip-build     Install the bundle from an earlier build.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseHostTriple } from './build-desktop.ts'

const root = resolve(import.meta.dir, '..')
const tauriConfig = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8')) as {
  productName: string
  mainBinaryName: string
}

const LSREGISTER =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'

export interface InstallOptions {
  dmg: boolean
  launch: boolean
  build: boolean
  dest: string
}

export function parseInstallArgs(args: string[], env: Record<string, string | undefined> = process.env): InstallOptions {
  const destIndex = args.indexOf('--dest')
  const dest = destIndex === -1 ? env.LIVE_PLAN_DESKTOP_DEST : args[destIndex + 1]
  return {
    dmg: args.includes('--dmg'),
    launch: !args.includes('--no-launch'),
    build: !args.includes('--skip-build'),
    dest: resolve(dest?.trim() || '/Applications'),
  }
}

/** Arguments after `bun run desktop:build --`. */
export function tauriBuildArgs(triple: string, dmg: boolean): string[] {
  return ['--target', triple, '--bundles', dmg ? 'app,dmg' : 'app']
}

/** Where `tauri build --target <triple>` leaves the .app. */
export function builtAppPath(triple: string, productName = tauriConfig.productName): string {
  return join(root, 'src-tauri/target', triple, 'release/bundle/macos', `${productName}.app`)
}

function fail(message: string): never {
  console.error(`desktop:install: ${message}`)
  process.exit(1)
}

function step(message: string): void {
  console.log(`desktop:install: ${message}`)
}

function run(command: string, args: string[], options: { quiet?: boolean } = {}): number {
  const result = spawnSync(command, args, { cwd: root, stdio: options.quiet ? 'ignore' : 'inherit' })
  if (result.error) fail(`${command} failed: ${result.error.message}`)
  return result.status ?? 1
}

function isRunning(binaryName: string): boolean {
  return run('pgrep', ['-x', binaryName], { quiet: true }) === 0
}

/** Ask the app to quit, wait for it, and kill it if it is still there after five seconds. */
async function quitRunningApp(productName: string, binaryName: string): Promise<void> {
  if (!isRunning(binaryName)) return
  step(`quitting ${productName}`)
  run('osascript', ['-e', `quit app "${productName}"`], { quiet: true })
  for (let waited = 0; waited < 5000 && isRunning(binaryName); waited += 250) await Bun.sleep(250)
  if (isRunning(binaryName)) run('pkill', ['-x', binaryName], { quiet: true })
}

async function main(): Promise<void> {
  if (process.platform !== 'darwin') fail('the desktop app installs on macOS only')
  const options = parseInstallArgs(process.argv.slice(2))
  const rustc = spawnSync('rustc', ['-vV'], { encoding: 'utf8' })
  const triple = parseHostTriple(rustc.stdout ?? '')
  if (!triple) fail('could not read the host triple from `rustc -vV`. Is Rust installed?')

  if (options.build) {
    const args = ['run', 'desktop:build', '--', ...tauriBuildArgs(triple, options.dmg)]
    const build = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' })
    if (build.status !== 0) fail('`bun run desktop:build` failed')
  }

  const { productName, mainBinaryName } = tauriConfig
  const built = builtAppPath(triple)
  if (!existsSync(built)) fail(`${built} is missing. Run without --skip-build.`)
  const installed = join(options.dest, `${productName}.app`)

  await quitRunningApp(productName, mainBinaryName)
  step(`installing ${installed}`)
  rmSync(installed, { recursive: true, force: true })
  if (run('ditto', [built, installed]) !== 0) fail(`could not copy the app to ${installed}`)
  if (run('codesign', ['--verify', '--deep', installed]) !== 0) fail(`${installed} fails its signature check`)
  run(LSREGISTER, ['-f', installed])

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
  if (options.launch) run('open', ['-a', installed])
  if (options.dmg) step(`.dmg under ${join(root, 'src-tauri/target', triple, 'release/bundle/dmg')}`)
  step(`${productName} ${pkg.version} installed${options.launch ? ' and launched' : ''}`)
}

if (import.meta.main) await main()
