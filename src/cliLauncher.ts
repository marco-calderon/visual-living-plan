/**
 * Put `live-plan` on the PATH from an install that has no npm, such as the desktop app
 * (`live-plan desktop install-cli`).
 *
 * The launcher is a small script that runs this install's CLI with the runtime that is running it
 * now. It is written into a folder on the person's PATH when one is writable, else into
 * `~/.local/bin`. A `live-plan` that something else installed, such as npm, is left alone.
 */
import { spawn } from 'node:child_process'
import { accessSync, constants, existsSync, readFileSync, statSync } from 'node:fs'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

/** Both names of the program, as in `package.json` `bin`. */
export const LAUNCHER_NAMES = ['live-plan', 'visual-living-plan'] as const

/** A line only our launcher has. */
export const LAUNCHER_MARK = 'Living Plan launcher'

export type LauncherTarget = {
  /** The Bun binary that runs the CLI. */
  runtime: string
  /** The CLI entry, `dist/cli.js`. */
  entry: string
}

export type LauncherEnv = {
  platform: NodeJS.Platform
  home: string
  /** The folders on the person's PATH, in order. */
  path: string[]
}

export type LauncherStatus = {
  /** `live-plan` on the PATH runs this install. */
  installed: boolean
  /** Our launcher for this install is on disk, on the PATH or not. */
  present: boolean
  /** Where our launcher is, or where an install would write it. */
  path: string
  /** That folder is on the PATH. */
  onPath: boolean
  /** A `live-plan` on the PATH that is not our launcher, such as an npm install. */
  other: string | null
  /** Our launcher exists but runs another copy of the app, such as one that was moved. */
  stale: boolean
  /** A line to add to the shell profile when the folder is not on the PATH. */
  hint: string | null
}

function fileName(name: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? `${name}.cmd` : name
}

export function launcherScript(target: LauncherTarget, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return `@echo off\r\nrem ${LAUNCHER_MARK}. Written by the Living Plan app.\r\n"${target.runtime}" "${target.entry}" %*\r\n`
  }
  const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`
  return `#!/bin/sh\n# ${LAUNCHER_MARK}. Written by the Living Plan app. Safe to delete.\nexec ${quote(target.runtime)} ${quote(target.entry)} "$@"\n`
}

function readIfFile(path: string): string | null {
  try {
    return statSync(path).isFile() ? readFileSync(path, 'utf8') : null
  } catch {
    return null
  }
}

function isWritableDir(path: string): boolean {
  try {
    if (!statSync(path).isDirectory()) return false
    accessSync(path, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/** Folders a person's own tools go in, most personal first. */
function candidateDirs(env: LauncherEnv): string[] {
  if (env.platform === 'win32') return [join(env.home, 'AppData', 'Local', 'Microsoft', 'WindowsApps')]
  return [join(env.home, '.local', 'bin'), join(env.home, 'bin'), '/usr/local/bin', '/opt/homebrew/bin']
}

/** The first candidate that is on the PATH and writable, else `~/.local/bin`, which is created. */
export function launcherDir(env: LauncherEnv): string {
  const candidates = candidateDirs(env)
  return candidates.find((dir) => env.path.includes(dir) && isWritableDir(dir)) ?? candidates[0]!
}

function profileHint(dir: string, env: LauncherEnv): string {
  if (env.platform === 'win32') return `Add ${dir} to your PATH.`
  const shown = dir.startsWith(`${env.home}/`) ? `$HOME/${dir.slice(env.home.length + 1)}` : dir
  return `export PATH="${shown}:$PATH"`
}

export function launcherStatus(target: LauncherTarget, env: LauncherEnv): LauncherStatus {
  const name = fileName(LAUNCHER_NAMES[0], env.platform)
  const expected = launcherScript(target, env.platform)
  let ours: { path: string; current: boolean } | null = null
  let other: string | null = null
  for (const dir of env.path) {
    const path = join(dir, name)
    const text = readIfFile(path)
    if (text === null) continue
    // The first match is the one a shell runs.
    if (text.includes(LAUNCHER_MARK)) ours = { path, current: text === expected }
    else other = path
    break
  }
  if (!ours && !other) {
    // Installed earlier into a folder that is not on the PATH.
    for (const dir of candidateDirs(env)) {
      const path = join(dir, name)
      const text = readIfFile(path)
      if (text?.includes(LAUNCHER_MARK)) {
        ours = { path, current: text === expected }
        break
      }
    }
  }
  const dir = ours ? join(ours.path, '..') : launcherDir(env)
  const onPath = env.path.includes(dir)
  return {
    installed: Boolean(ours?.current) && onPath,
    present: Boolean(ours?.current),
    path: ours?.path ?? join(dir, name),
    onPath,
    other,
    stale: Boolean(ours && !ours.current),
    hint: onPath ? null : profileHint(dir, env),
  }
}

/** Write the launcher under both names. Refuses when another `live-plan` is first on the PATH. */
export async function installLauncher(target: LauncherTarget, env: LauncherEnv): Promise<LauncherStatus> {
  if (!existsSync(target.entry)) throw new Error(`The CLI is missing from this install (${target.entry}).`)
  const before = launcherStatus(target, env)
  if (before.other) {
    throw new Error(`live-plan is already installed at ${before.other}. Remove it first to use the one in this app.`)
  }
  const dir = join(before.path, '..')
  await mkdir(dir, { recursive: true })
  const script = launcherScript(target, env.platform)
  for (const name of LAUNCHER_NAMES) {
    const path = join(dir, fileName(name, env.platform))
    const existing = readIfFile(path)
    // The second name may belong to something else even when the first does not.
    if (existing !== null && !existing.includes(LAUNCHER_MARK)) continue
    await writeFile(path, script)
    await chmod(path, 0o755).catch(() => undefined)
  }
  return launcherStatus(target, env)
}

function splitPath(value: string | undefined): string[] {
  return (value ?? '').split(delimiter).filter(Boolean)
}

/**
 * The PATH of a login shell. An app opened from the Finder or a desktop menu gets a short PATH
 * that leaves out the folders a terminal has, so ask the person's shell. Null when it cannot say.
 */
function loginShellPath(env: NodeJS.ProcessEnv, timeoutMs = 4000): Promise<string | null> {
  const shell = env.SHELL
  if (!shell) return Promise.resolve(null)
  return new Promise((done) => {
    let output = ''
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(shell, ['-ilc', 'printf "\\n__LP_PATH__%s__LP_PATH__\\n" "$PATH"'], { stdio: ['ignore', 'pipe', 'ignore'] })
    } catch {
      done(null)
      return
    }
    const timer = setTimeout(() => {
      child.kill()
      done(null)
    }, timeoutMs)
    child.stdout?.on('data', (chunk) => {
      output += String(chunk)
    })
    child.on('error', () => {
      clearTimeout(timer)
      done(null)
    })
    child.on('exit', () => {
      clearTimeout(timer)
      done(output.match(/__LP_PATH__(.*?)__LP_PATH__/s)?.[1] ?? null)
    })
  })
}

/** This machine, with the PATH a terminal would have. */
export async function currentLauncherEnv(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): Promise<LauncherEnv> {
  const own = splitPath(env.PATH)
  const shell = platform === 'win32' ? null : await loginShellPath(env)
  const path = [...new Set([...splitPath(shell ?? undefined), ...own])]
  return { platform, home: homedir(), path }
}
