import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { WEB_MANIFEST_ID } from './webManifest'

/**
 * Open a page in the installed Living Plan app when this machine has one for
 * the page's origin, and in a browser tab otherwise.
 *
 * Chromium browsers (Chrome, Edge, Brave, Chromium) keep each installed web app
 * under `<profile>/Web Applications/Manifest Resources/<app id>`. The app id is
 * a hash of the manifest id, so it is known from the URL alone. Launching the
 * browser with `--app-id` and `--app-launch-url-for-shortcuts-menu-item` opens
 * that page in the app window. The same switches are what the app's own
 * shortcut menu runs. Other browsers fall back to a tab.
 *
 * `LIVE_PLAN_OPEN=browser` always uses a tab.
 */

export type OpenTarget = { platform: NodeJS.Platform; env: NodeJS.ProcessEnv; home: string }

export type InstalledApp = {
  browser: string
  binary: string
  profile: string
  appId: string
}

type ChromiumBrowser = { name: string; userData: string; binaries: string[] }

const currentTarget = (): OpenTarget => ({ platform: process.platform, env: process.env, home: homedir() })

/** Open `url`, preferring the installed app. */
export function openUrl(url: string, target: OpenTarget = currentTarget()): void {
  const app = target.env.LIVE_PLAN_OPEN === 'browser' ? null : findInstalledApp(url, target)
  if (app && launch(app.binary, appLaunchArgs(app, url))) return
  openInBrowser(url, target.platform)
}

/** Open `url` in the default browser, as a new tab. */
export function openInBrowser(url: string, platform: NodeJS.Platform = process.platform): void {
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url]
  launch(command, args)
}

export function appLaunchArgs(app: InstalledApp, url: string): string[] {
  return [
    `--profile-directory=${app.profile}`,
    `--app-id=${app.appId}`,
    `--app-launch-url-for-shortcuts-menu-item=${url}`,
  ]
}

/**
 * The Chromium web app id for a manifest id URL. Chromium hashes the URL with
 * SHA-256, hashes those 32 bytes again, and maps the first 16 bytes' hex
 * digits to a-p (`app_id_helpers.cc` and `crx_file::id_util::GenerateId`).
 */
export function chromiumAppId(manifestId: string): string {
  const inner = createHash('sha256').update(manifestId).digest()
  const hex = createHash('sha256').update(inner).digest('hex').slice(0, 32)
  return Array.from(hex, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16))).join('')
}

/** The manifest id an install from this page's origin has. */
export function manifestIdFor(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return new URL(WEB_MANIFEST_ID, parsed.origin).href
  } catch {
    return null
  }
}

/** The first browser profile on this machine that installed the app for `url`'s origin. */
export function findInstalledApp(url: string, target: OpenTarget = currentTarget()): InstalledApp | null {
  const manifestId = manifestIdFor(url)
  if (!manifestId) return null
  const appId = chromiumAppId(manifestId)
  for (const browser of chromiumBrowsers(target)) {
    const profile = profilesOf(browser.userData).find((name) =>
      existsSync(join(browser.userData, name, 'Web Applications', 'Manifest Resources', appId)),
    )
    if (!profile) continue
    const binary = browser.binaries.find(isFile)
    if (binary) return { browser: browser.name, binary, profile, appId }
  }
  return null
}

function chromiumBrowsers({ platform, env, home }: OpenTarget): ChromiumBrowser[] {
  if (platform === 'darwin') {
    const support = join(home, 'Library', 'Application Support')
    const app = (bundle: string, binary: string) => [
      join('/Applications', bundle, 'Contents', 'MacOS', binary),
      join(home, 'Applications', bundle, 'Contents', 'MacOS', binary),
    ]
    return [
      { name: 'Chrome', userData: join(support, 'Google', 'Chrome'), binaries: app('Google Chrome.app', 'Google Chrome') },
      { name: 'Edge', userData: join(support, 'Microsoft Edge'), binaries: app('Microsoft Edge.app', 'Microsoft Edge') },
      { name: 'Brave', userData: join(support, 'BraveSoftware', 'Brave-Browser'), binaries: app('Brave Browser.app', 'Brave Browser') },
      { name: 'Chromium', userData: join(support, 'Chromium'), binaries: app('Chromium.app', 'Chromium') },
    ]
  }
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], local].filter((root): root is string => Boolean(root))
    const exe = (...parts: string[]) => roots.map((root) => join(root, ...parts))
    return [
      { name: 'Chrome', userData: join(local, 'Google', 'Chrome', 'User Data'), binaries: exe('Google', 'Chrome', 'Application', 'chrome.exe') },
      { name: 'Edge', userData: join(local, 'Microsoft', 'Edge', 'User Data'), binaries: exe('Microsoft', 'Edge', 'Application', 'msedge.exe') },
      {
        name: 'Brave',
        userData: join(local, 'BraveSoftware', 'Brave-Browser', 'User Data'),
        binaries: exe('BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      },
      { name: 'Chromium', userData: join(local, 'Chromium', 'User Data'), binaries: exe('Chromium', 'Application', 'chrome.exe') },
    ]
  }
  const config = env.XDG_CONFIG_HOME || join(home, '.config')
  const onPath = (...names: string[]) => names.flatMap((name) => pathCandidates(name, env))
  return [
    { name: 'Chrome', userData: join(config, 'google-chrome'), binaries: onPath('google-chrome', 'google-chrome-stable') },
    { name: 'Edge', userData: join(config, 'microsoft-edge'), binaries: onPath('microsoft-edge', 'microsoft-edge-stable') },
    { name: 'Brave', userData: join(config, 'BraveSoftware', 'Brave-Browser'), binaries: onPath('brave-browser', 'brave') },
    { name: 'Chromium', userData: join(config, 'chromium'), binaries: onPath('chromium', 'chromium-browser') },
    { name: 'Chromium', userData: join(home, 'snap', 'chromium', 'common', 'chromium'), binaries: onPath('chromium') },
  ]
}

/** Profile folders in a browser's user data, `Default` first. */
function profilesOf(userData: string): string[] {
  let names: string[]
  try {
    names = readdirSync(userData)
  } catch {
    return []
  }
  const profiles = names.filter((name) => name === 'Default' || /^Profile \d+$/.test(name))
  return profiles.sort((a, b) => (a === 'Default' ? -1 : b === 'Default' ? 1 : a.localeCompare(b, undefined, { numeric: true })))
}

function pathCandidates(name: string, env: NodeJS.ProcessEnv): string[] {
  return (env.PATH ?? '').split(delimiter).filter(Boolean).map((dir) => join(dir, name))
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function launch(command: string, args: string[]): boolean {
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true })
    child.on('error', () => {
      // A missing opener must not take down the CLI or the terminal UI.
    })
    child.unref()
    return true
  } catch {
    return false
  }
}
