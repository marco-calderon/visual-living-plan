#!/usr/bin/env bun
/**
 * Stage what the desktop app ships beside its window (`bun run desktop:stage`). The Tauri CLI runs
 * this before `tauri dev` and `tauri build`.
 *
 *   src-tauri/service/    The plan service: src/cli.ts bundled into one dist/cli.js, and the files it
 *                         reads beside itself (client build, icons, styles, package.json, changelogs).
 *   src-tauri/binaries/   The Bun runtime that runs it, as living-plan-bun-<target triple>. Tauri
 *                         installs it beside the app binary as living-plan-bun, a name that does not
 *                         shadow a `bun` on the PATH.
 *
 * The app runs `living-plan-bun service/dist/cli.js dashboard --json --any-version`, so it needs
 * neither Bun nor the npm package on the machine.
 *
 * --skip-build      Reuse dist/ from an earlier `bun run build`.
 * --target TRIPLE   Rust target triple. Defaults to TAURI_ENV_TARGET_TRIPLE, then this machine's.
 * --bun PATH        Bun binary to ship. Defaults to LIVE_PLAN_DESKTOP_BUN, then the Bun running this
 *                   script. Required when the target is not this machine's.
 */
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const tauriDir = join(root, 'src-tauri')

/** Files from `bun run build` that the service reads beside its entry, as [from, to] under the stage. */
export const SERVICE_ASSETS: ReadonlyArray<readonly [string, string]> = [
  ['dist/client', 'dist/client'],
  ['dist/icons', 'dist/icons'],
  ['dist/favicon.png', 'dist/favicon.png'],
  ['dist/planPage.css', 'dist/planPage.css'],
  ['dist/shellWorker.js', 'dist/shellWorker.js'],
  ['docs/changelogs', 'docs/changelogs'],
  // `src/elkRuntime.node.ts` evaluates elk's worker from disk, so the bundle cannot inline it.
  ['node_modules/elkjs/package.json', 'node_modules/elkjs/package.json'],
  ['node_modules/elkjs/LICENSE.md', 'node_modules/elkjs/LICENSE.md'],
  ['node_modules/elkjs/lib/elk-worker.min.js', 'node_modules/elkjs/lib/elk-worker.min.js'],
]

/** The name Tauri looks for under `binaries/` for `externalBin: ["binaries/living-plan-bun"]`. */
export function sidecarFileName(triple: string): string {
  return `living-plan-bun-${triple}${triple.includes('windows') ? '.exe' : ''}`
}

/** The `host:` line of `rustc -vV`. */
export function parseHostTriple(rustcVersion: string): string | null {
  const match = rustcVersion.match(/^host:\s*(\S+)\s*$/m)
  return match?.[1] ?? null
}

/** The package.json the bundled service reads its version from. Only what it needs. */
export function servicePackageJson(pkg: { name?: string; version?: string; description?: string; license?: string }) {
  return {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    license: pkg.license,
    private: true,
    type: 'module',
  }
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

function fail(message: string): never {
  console.error(`desktop:stage: ${message}`)
  process.exit(1)
}

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  if (result.error) fail(`${command} failed: ${result.error.message}`)
  if (result.status !== 0) fail(`${command} ${args.join(' ')} exited with ${result.status}`)
  return result.stdout
}

function hostTriple(): string {
  const triple = parseHostTriple(run('rustc', ['-vV']))
  if (!triple) fail('could not read the host triple from `rustc -vV`. Is Rust installed?')
  return triple
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const target = flag(args, '--target') ?? process.env.TAURI_ENV_TARGET_TRIPLE ?? hostTriple()
  const explicitBun = flag(args, '--bun') ?? process.env.LIVE_PLAN_DESKTOP_BUN
  if (!explicitBun && target !== hostTriple()) {
    fail(`building for ${target} on ${hostTriple()}. Pass --bun with a Bun binary for ${target}.`)
  }
  const bun = explicitBun ?? process.execPath

  if (!args.includes('--skip-build')) {
    const build = spawnSync(process.execPath, ['run', 'build'], { cwd: root, stdio: 'inherit' })
    if (build.status !== 0) fail('`bun run build` failed')
  }
  for (const [from] of SERVICE_ASSETS) {
    if (!existsSync(join(root, from))) fail(`${from} is missing. Run \`bun run build\` (and \`bun install\`) first.`)
  }

  const stage = join(tauriDir, 'service')
  rmSync(stage, { recursive: true, force: true })
  mkdirSync(join(stage, 'dist'), { recursive: true })

  const bundle = await Bun.build({
    entrypoints: [join(root, 'src/cli.ts')],
    target: 'bun',
    outdir: join(stage, 'dist'),
    naming: 'cli.js',
  })
  if (!bundle.success) {
    for (const log of bundle.logs) console.error(log)
    fail('bundling src/cli.ts failed')
  }

  for (const [from, to] of SERVICE_ASSETS) {
    const destination = join(stage, to)
    mkdirSync(dirname(destination), { recursive: true })
    cpSync(join(root, from), destination, { recursive: true })
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  writeFileSync(join(stage, 'package.json'), `${JSON.stringify(servicePackageJson(pkg), null, 2)}\n`)

  const binaries = join(tauriDir, 'binaries')
  mkdirSync(binaries, { recursive: true })
  const sidecar = join(binaries, sidecarFileName(target))
  rmSync(sidecar, { force: true })
  copyFileSync(bun, sidecar)
  chmodSync(sidecar, 0o755)

  // The staged service must start under the staged runtime and report this package's version.
  if (target === hostTriple()) {
    const version = run(sidecar, [join(stage, 'dist/cli.js'), '--version']).trim()
    if (version !== pkg.version) fail(`the staged service reports ${version}, expected ${pkg.version}`)
  }
  console.log(`desktop:stage: service ${pkg.version} in src-tauri/service, Bun for ${target} in src-tauri/binaries`)
}

if (import.meta.main) await main()
