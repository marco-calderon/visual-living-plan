/**
 * What the desktop app remembers between launches ([ADR 0038]): whether it opens the plans on this
 * machine or the hosted ones, which host that is, the color mode, and the look chosen in setup.
 *
 * The file is `desktop.json` in the config home, beside `cloud.json`. The app reads and writes it
 * through `live-plan desktop state` and `live-plan desktop configure`. The CLI reads it to know
 * which hosted pages the app can show (`src/desktopApp.ts`).
 *
 * [ADR 0038]: ../docs/architecture/decisions/0038-desktop-setup-and-cloud.md
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { normalizeBase } from './cloudStore'
import { defaultRegistryHome } from './configHome'
import { isKnownDiffsTheme, normalizeDiffsTheme } from './diffsTheme'
import { isLoopbackHost } from './localName'
import { normalizeAccent } from './theme'

export const DESKTOP_MODES = ['local', 'cloud'] as const
export type DesktopMode = (typeof DESKTOP_MODES)[number]

export const COLOR_MODES = ['system', 'light', 'dark'] as const
export type ColorMode = (typeof COLOR_MODES)[number]

/** The accent and syntax theme chosen in setup. A hosted page saves a newer one to the account once. */
export type DesktopAppearance = { accent: string; diffsTheme: string; savedAt: number }

export type DesktopConfig = {
  /** False until the person finishes the setup screen once. */
  setupDone: boolean
  mode: DesktopMode
  /** Origin of the hosted app, such as `https://plans.example.com`. */
  cloudUrl: string | null
  colorMode: ColorMode
  appearance: DesktopAppearance | null
}

export type DesktopConfigPatch = {
  setupDone?: unknown
  mode?: unknown
  cloudUrl?: unknown
  colorMode?: unknown
  accent?: unknown
  diffsTheme?: unknown
}

export function defaultDesktopConfig(): DesktopConfig {
  return { setupDone: false, mode: 'local', cloudUrl: null, colorMode: 'system', appearance: null }
}

export function desktopConfigPath(home = defaultRegistryHome()): string {
  return join(home, 'desktop.json')
}

function oneOf<T extends string>(values: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? (value as T) : null
}

/**
 * The origin of a hosted app. It must be `https`, or `http` on loopback for a development host.
 * A bare host name gets `https://`. Throws with a sentence a person can act on.
 */
export function normalizeCloudUrl(raw: string): string {
  const text = raw.trim()
  if (!text) throw new Error('Enter the address of the cloud host.')
  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    throw new Error(`${text} is not an address. Use one like https://plans.example.com.`)
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname))) {
    throw new Error('The cloud host must use https.')
  }
  if (url.username || url.password) throw new Error('Leave the user name and password out of the address.')
  return normalizeBase(url.href)
}

function parseAppearance(raw: unknown): DesktopAppearance | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const accent = normalizeAccent(typeof record.accent === 'string' ? record.accent : undefined)
  const diffsTheme = typeof record.diffsTheme === 'string' && isKnownDiffsTheme(record.diffsTheme) ? normalizeDiffsTheme(record.diffsTheme) : null
  const savedAt = typeof record.savedAt === 'number' && Number.isFinite(record.savedAt) ? record.savedAt : 0
  return accent && diffsTheme ? { accent, diffsTheme, savedAt } : null
}

/** Read a stored config. Anything unreadable falls back to the default for that field. */
export function parseDesktopConfig(raw: unknown): DesktopConfig {
  const config = defaultDesktopConfig()
  if (!raw || typeof raw !== 'object') return config
  const record = raw as Record<string, unknown>
  if (typeof record.cloudUrl === 'string') {
    try {
      config.cloudUrl = normalizeCloudUrl(record.cloudUrl)
    } catch {
      config.cloudUrl = null
    }
  }
  config.setupDone = record.setupDone === true
  config.colorMode = oneOf(COLOR_MODES, record.colorMode) ?? 'system'
  config.appearance = parseAppearance(record.appearance)
  const mode = oneOf(DESKTOP_MODES, record.mode) ?? 'local'
  // Cloud without a host cannot open anything.
  config.mode = mode === 'cloud' && !config.cloudUrl ? 'local' : mode
  return config
}

export async function readDesktopConfig(home = defaultRegistryHome()): Promise<DesktopConfig> {
  try {
    return parseDesktopConfig(JSON.parse(await readFile(desktopConfigPath(home), 'utf8')))
  } catch {
    return defaultDesktopConfig()
  }
}

export async function writeDesktopConfig(config: DesktopConfig, home = defaultRegistryHome()): Promise<void> {
  const path = desktopConfigPath(home)
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`)
}

/**
 * Apply a change from the setup screen. `fallbackCloudUrl` is the host the CLI is signed in to, used
 * when cloud is chosen and the config names no host. Throws when a value is not one the app accepts.
 */
export function mergeDesktopConfig(
  current: DesktopConfig,
  patch: DesktopConfigPatch,
  options: { now?: number; fallbackCloudUrl?: string | null } = {},
): DesktopConfig {
  const next: DesktopConfig = { ...current }
  if (patch.cloudUrl !== undefined) {
    if (patch.cloudUrl === null || patch.cloudUrl === '') next.cloudUrl = null
    else if (typeof patch.cloudUrl === 'string') next.cloudUrl = normalizeCloudUrl(patch.cloudUrl)
    else throw new Error('cloudUrl must be an address.')
  }
  if (patch.mode !== undefined) {
    const mode = oneOf(DESKTOP_MODES, patch.mode)
    if (!mode) throw new Error('mode must be local or cloud.')
    next.mode = mode
  }
  if (next.mode === 'cloud' && !next.cloudUrl) {
    if (patch.mode === undefined) next.mode = 'local'
    else if (options.fallbackCloudUrl) next.cloudUrl = normalizeCloudUrl(options.fallbackCloudUrl)
    else throw new Error('Enter the address of the cloud host first.')
  }
  if (patch.colorMode !== undefined) {
    const colorMode = oneOf(COLOR_MODES, patch.colorMode)
    if (!colorMode) throw new Error('colorMode must be system, light, or dark.')
    next.colorMode = colorMode
  }
  if (patch.accent !== undefined || patch.diffsTheme !== undefined) {
    const accent = patch.accent === undefined ? current.appearance?.accent : normalizeAccent(typeof patch.accent === 'string' ? patch.accent : undefined)
    if (patch.accent !== undefined && !accent) throw new Error('accent must be a hex color such as #0f766e.')
    if (patch.diffsTheme !== undefined && !(typeof patch.diffsTheme === 'string' && isKnownDiffsTheme(patch.diffsTheme))) {
      throw new Error('diffsTheme is not a known syntax theme.')
    }
    const diffsTheme = patch.diffsTheme === undefined ? current.appearance?.diffsTheme : normalizeDiffsTheme(patch.diffsTheme as string)
    if (accent && diffsTheme) next.appearance = { accent, diffsTheme, savedAt: options.now ?? Date.now() }
  }
  if (patch.setupDone !== undefined) next.setupDone = patch.setupDone === true
  return next
}
