import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** XDG application directory name under `$XDG_CONFIG_HOME` / `~/.config`. */
export const APP_CONFIG_DIRNAME = 'living-plan'

/** Machine-wide theme filename (plan-adjacent copies keep the same name beside the plan). */
export const GLOBAL_THEME_CONFIG_FILENAME = 'live-plan.config.json'

/** Pre-XDG registry home (`registry.json`, `registry.sqlite`, plan copies). */
export const LEGACY_REGISTRY_DIRNAME = '.visual-living-plan'

/** Pre-XDG diagnostic log home (daily registry files and per-plan logs). */
export const LEGACY_LOG_DIRNAME = '.living-plan'

/** Prefer `HOME` / `USERPROFILE` so tests can isolate the tree; fall back to `os.homedir()`. */
function userHome(): string {
  const fromEnv = process.env.HOME?.trim() || process.env.USERPROFILE?.trim()
  if (fromEnv) return resolve(fromEnv)
  return homedir()
}

export function xdgConfigHome(): string {
  const override = process.env.XDG_CONFIG_HOME?.trim()
  if (override) return resolve(override)
  return join(userHome(), '.config')
}

/** Canonical machine config directory: `~/.config/living-plan` (or `$XDG_CONFIG_HOME/living-plan`). */
export function defaultConfigHome(): string {
  return join(xdgConfigHome(), APP_CONFIG_DIRNAME)
}

export function legacyRegistryHome(): string {
  return join(userHome(), LEGACY_REGISTRY_DIRNAME)
}

export function legacyLogHome(): string {
  return join(userHome(), LEGACY_LOG_DIRNAME)
}

function hasRegistryState(home: string): boolean {
  return existsSync(join(home, 'registry.sqlite')) || existsSync(join(home, 'registry.json'))
}

function dirHasEntries(path: string): boolean {
  try {
    return readdirSync(path).length > 0
  } catch {
    return false
  }
}

/** True when a lock file names a still-alive process (do not migrate out from under it). */
export function legacyRegistryInUse(home = legacyRegistryHome()): boolean {
  try {
    const raw = readFileSync(join(home, 'registry.json'), 'utf8')
    const parsed = JSON.parse(raw) as { pid?: unknown }
    if (typeof parsed.pid !== 'number' || !Number.isInteger(parsed.pid) || parsed.pid <= 0) {
      return false
    }
    try {
      process.kill(parsed.pid, 0)
      return true
    } catch {
      return false
    }
  } catch {
    return false
  }
}

/** Move each missing entry from `from` into `to`. Leaves `from` when a rename fails mid-way. */
export function migrateHomeContents(from: string, to: string): void {
  if (from === to || !dirHasEntries(from)) return
  mkdirSync(to, { recursive: true, mode: 0o700 })
  for (const name of readdirSync(from)) {
    const source = join(from, name)
    const destination = join(to, name)
    if (existsSync(destination)) continue
    try {
      renameSync(source, destination)
    } catch {
      cpSync(source, destination, { recursive: true, force: false })
    }
  }
}

/**
 * Service data home: lock file, SQLite, archived plan copies, daemon `registry.log`.
 * `LIVE_PLAN_HOME` wins. Otherwise `~/.config/living-plan`, with a one-shot move from
 * `~/.visual-living-plan` when that directory is idle. A live legacy lock keeps the old path
 * until that process stops so an upgrade does not start a second service.
 */
export function defaultRegistryHome(): string {
  const override = process.env.LIVE_PLAN_HOME?.trim()
  if (override) return resolve(override)

  const preferred = defaultConfigHome()
  if (hasRegistryState(preferred)) return preferred

  const legacy = legacyRegistryHome()
  if (legacyRegistryInUse(legacy)) return legacy
  if (hasRegistryState(legacy)) {
    migrateHomeContents(legacy, preferred)
  }
  return preferred
}

/**
 * Diagnostic log files. `LIVE_PLAN_LOG_HOME` wins. Otherwise `~/.config/living-plan/logs`.
 * While the registry still runs from the legacy home, keep reading and writing `~/.living-plan`
 * so `live-plan logs` matches that process. Idle legacy logs are moved once into the new tree.
 */
export function defaultLogHome(): string {
  const override = process.env.LIVE_PLAN_LOG_HOME?.trim()
  if (override) return resolve(override)

  const preferred = join(defaultConfigHome(), 'logs')
  const registryHome = defaultRegistryHome()
  if (registryHome === legacyRegistryHome()) {
    return legacyLogHome()
  }

  if (dirHasEntries(preferred)) return preferred

  const legacy = legacyLogHome()
  if (dirHasEntries(legacy)) {
    if (legacyRegistryInUse()) return legacy
    migrateHomeContents(legacy, preferred)
  }
  return preferred
}

/** Machine-wide theme file under the config home (not beside a plan). */
export function globalThemeConfigPath(): string {
  return join(defaultConfigHome(), GLOBAL_THEME_CONFIG_FILENAME)
}

/** CWD `live-plan.config.json` — older default when `theme` ran without `--plan`. */
export function cwdThemeConfigPath(cwd = process.cwd()): string {
  return resolve(cwd, GLOBAL_THEME_CONFIG_FILENAME)
}
