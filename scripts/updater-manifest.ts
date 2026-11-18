#!/usr/bin/env bun
/**
 * The desktop app's update packages and the manifest that names them (ADR 0041). The Desktop
 * workflow runs both on a published release.
 *
 *   package --target TRIPLE [--out DIR]
 *       Copy the signed update package `tauri build` wrote for TRIPLE
 *       (`bundle/macos/Living Plan.app.tar.gz` and its `.sig`) to DIR under a name that carries the
 *       version and the architecture, `Living.Plan_<version>_<arch>.app.tar.gz`, so both Mac builds
 *       fit on one release. DIR defaults to src-tauri/target/updater.
 *
 *   manifest --dir DIR --base-url URL [--out FILE]
 *       Write `latest.json` for the packages in DIR, each downloaded from URL/<name>. The version is
 *       package.json's, which is the version the app was built with. RELEASE_NOTES, when set,
 *       becomes the notes. FILE defaults to latest.json.
 *
 * The app reads `releases/latest/download/latest.json`. The `version` there must be newer than the
 * app's for an update to install, and each package's signature carries the version it was signed
 * for, which must be the same one.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** The Mac builds, as Rust target triples, and how the updater and the release name each. */
export const UPDATE_TARGETS = {
  'aarch64-apple-darwin': { platform: 'darwin-aarch64', arch: 'aarch64' },
  'x86_64-apple-darwin': { platform: 'darwin-x86_64', arch: 'x64' },
} as const

export type UpdateTriple = keyof typeof UPDATE_TARGETS

export type UpdatePackage = {
  /** The file name on the release. */
  name: string
  /** The contents of its `.sig` file. */
  signature: string
}

export type UpdateManifest = {
  version: string
  notes?: string
  pub_date: string
  platforms: Record<string, { signature: string; url: string }>
}

const PACKAGE_SUFFIX = '.app.tar.gz'

function isTriple(triple: string): triple is UpdateTriple {
  return Object.hasOwn(UPDATE_TARGETS, triple)
}

/** `Living Plan`, 2.31.0, aarch64-apple-darwin → `Living.Plan_2.31.0_aarch64.app.tar.gz`. */
export function updatePackageName(productName: string, version: string, triple: string): string {
  if (!isTriple(triple)) throw new Error(`no update package for ${triple}`)
  // GitHub turns spaces in asset names into dots. The name says so itself.
  return `${productName.replaceAll(' ', '.')}_${version}_${UPDATE_TARGETS[triple].arch}${PACKAGE_SUFFIX}`
}

/** The version and updater platform a package name carries, or null for another file. */
export function parseUpdatePackageName(name: string): { version: string; platform: string } | null {
  const match = name.match(/_(\d[^_]*)_([a-z0-9]+)\.app\.tar\.gz$/)
  if (!match) return null
  const [, version, arch] = match
  const target = Object.values(UPDATE_TARGETS).find((entry) => entry.arch === arch)
  return target ? { version, platform: target.platform } : null
}

/** `latest.json` for `packages`, which must all be `version`. */
export function buildManifest(options: {
  version: string
  baseUrl: string
  packages: UpdatePackage[]
  notes?: string
  date?: Date
}): UpdateManifest {
  const { version, packages } = options
  if (packages.length === 0) throw new Error('no update packages')
  const base = options.baseUrl.replace(/\/+$/, '')
  const platforms: UpdateManifest['platforms'] = {}
  for (const pkg of packages) {
    const parsed = parseUpdatePackageName(pkg.name)
    if (!parsed) throw new Error(`${pkg.name} is not an update package name`)
    if (parsed.version !== version) {
      throw new Error(`${pkg.name} is version ${parsed.version}, but the release is ${version}`)
    }
    if (platforms[parsed.platform]) throw new Error(`two update packages for ${parsed.platform}`)
    const signature = pkg.signature.trim()
    if (!signature) throw new Error(`${pkg.name} has an empty signature`)
    platforms[parsed.platform] = { signature, url: `${base}/${encodeURIComponent(pkg.name)}` }
  }
  const notes = options.notes?.trim()
  return {
    version,
    ...(notes ? { notes } : {}),
    // RFC 3339 without fractions of a second.
    pub_date: (options.date ?? new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    platforms,
  }
}

/** The update packages in `dir`, each with its `.sig` beside it. */
export function readUpdatePackages(dir: string): UpdatePackage[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(PACKAGE_SUFFIX))
    .sort()
    .map((name) => {
      const sig = join(dir, `${name}.sig`)
      if (!existsSync(sig)) throw new Error(`${name} has no ${name}.sig beside it`)
      return { name, signature: readFileSync(sig, 'utf8') }
    })
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

function required(args: string[], name: string): string {
  const value = flag(args, name)
  if (!value) throw new Error(`${name} is required`)
  return value
}

function packageCommand(args: string[]): void {
  const triple = required(args, '--target')
  const out = flag(args, '--out') ?? join(root, 'src-tauri/target/updater')
  const { version } = readJson(join(root, 'package.json'))
  const { productName } = readJson(join(root, 'src-tauri/tauri.conf.json'))
  const name = updatePackageName(productName, version, triple)
  const bundle = join(root, 'src-tauri/target', triple, 'release/bundle/macos')
  const built = join(bundle, `${productName}${PACKAGE_SUFFIX}`)
  if (!existsSync(built) || !existsSync(`${built}.sig`)) {
    throw new Error(`${built} and its .sig are missing. Build with createUpdaterArtifacts and TAURI_SIGNING_PRIVATE_KEY.`)
  }
  mkdirSync(out, { recursive: true })
  copyFileSync(built, join(out, name))
  copyFileSync(`${built}.sig`, join(out, `${name}.sig`))
  console.log(join(out, name))
}

function manifestCommand(args: string[]): void {
  const dir = required(args, '--dir')
  const baseUrl = required(args, '--base-url')
  const out = flag(args, '--out') ?? 'latest.json'
  const { version } = readJson(join(root, 'package.json'))
  const manifest = buildManifest({
    version,
    baseUrl,
    packages: readUpdatePackages(dir),
    notes: process.env.RELEASE_NOTES,
  })
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`${out}: ${version} for ${Object.keys(manifest.platforms).join(', ')}`)
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2)
  try {
    if (command === 'package') packageCommand(args)
    else if (command === 'manifest') manifestCommand(args)
    else throw new Error('usage: updater-manifest.ts package --target TRIPLE | manifest --dir DIR --base-url URL')
  } catch (error) {
    console.error(`updater-manifest: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}
