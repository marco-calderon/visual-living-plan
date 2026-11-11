/**
 * Open a page in the Living Plan desktop app when it is installed ([ADR 0037], [ADR 0038]).
 *
 * The app (`src-tauri/`) registers the `living-plan` URL scheme:
 *
 *   living-plan://plans/<id>         that plan, on this machine's plan service
 *   living-plan://dashboard          the dashboard
 *   living-plan://cloud/plans/<id>   that plan, on the hosted app the desktop app is set up with
 *   living-plan://cloud/dashboard    the hosted dashboard
 *
 * A link names a page by id, never by URL. A hosted page has a link only when its origin is the
 * one the app knows: the host chosen in setup, or the one `account login` signed in to. A private
 * `--no-registry` server and a LAN or `--host` address go to the web app or the browser. The app
 * ships for macOS only for now, so other platforms skip it.
 *
 * [ADR 0037]: ../docs/architecture/decisions/0037-plans-open-in-the-desktop-app.md
 * [ADR 0038]: ../docs/architecture/decisions/0038-desktop-setup-and-cloud.md
 */
import { spawn } from 'node:child_process'
import { readCloudFile } from './cloudStore'
import { readDesktopConfig } from './desktopConfig'
import { isLoopbackHost } from './localName'

export const DESKTOP_SCHEME = 'living-plan'

/** Plan ids are a hash of the plan path. The app accepts the same characters. */
const PLAN_ID = /^[A-Za-z0-9_-]{1,128}$/

function pageLink(url: URL, prefix: string): string | null {
  if (url.pathname === '/dashboard' || url.pathname === '/dashboard/') return `${prefix}dashboard`
  const id = url.pathname.match(/^\/plans\/([^/]+)\/?$/)?.[1]
  if (!id || !PLAN_ID.test(id)) return null
  return `${prefix}plans/${id}`
}

/**
 * The `living-plan://` link for a page on the local service, or on `cloudUrl`, the hosted app the
 * desktop app is set up with. Null when the app cannot show the page.
 */
export function desktopLinkFor(pageUrl: string, cloudUrl?: string | null): string | null {
  let url: URL
  try {
    url = new URL(pageUrl)
  } catch {
    return null
  }
  if (cloudUrl) {
    try {
      if (new URL(cloudUrl).origin === url.origin) return pageLink(url, `${DESKTOP_SCHEME}://cloud/`)
    } catch {
      // An unreadable host matches nothing.
    }
  }
  if (url.protocol !== 'http:' || !isLoopbackHost(url.hostname)) return null
  return pageLink(url, `${DESKTOP_SCHEME}://`)
}

/** The hosted app the desktop app opens: the host chosen in setup, else the one the CLI is signed in to. */
export async function desktopCloudUrl(): Promise<string | null> {
  try {
    return (await readDesktopConfig()).cloudUrl ?? (await readCloudFile()).account?.baseUrl ?? null
  } catch {
    return null
  }
}

/** `LIVE_PLAN_DESKTOP=0` (or `off`, `false`, `no`) keeps every page in the browser. */
export function desktopAppDisabled(env: NodeJS.ProcessEnv): boolean {
  const value = env.LIVE_PLAN_DESKTOP?.trim().toLowerCase()
  return value === '0' || value === 'off' || value === 'false' || value === 'no'
}

export type DesktopOpenDeps = {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  /** The hosted app the desktop app is set up with. Read from the config home when omitted. */
  cloudUrl?: () => Promise<string | null>
  /** Run a command with no output and resolve its exit code, or null when it could not run. */
  run?: (command: string, args: string[]) => Promise<number | null>
}

function runQuietly(command: string, args: string[], timeoutMs = 10_000): Promise<number | null> {
  return new Promise((resolveExit) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(command, args, { stdio: 'ignore' })
    } catch {
      resolveExit(null)
      return
    }
    const timer = setTimeout(() => {
      child.kill()
      resolveExit(null)
    }, timeoutMs)
    child.on('error', () => {
      clearTimeout(timer)
      resolveExit(null)
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolveExit(code)
    })
  })
}

const defaultDeps: DesktopOpenDeps = { platform: process.platform, env: process.env, run: runQuietly }

/**
 * Open the page in the desktop app. Resolves false when the page has no app link, the app is
 * turned off, or it is not installed, so `openUrl` tries the web app and then a browser tab.
 */
export async function openInDesktopApp(pageUrl: string, deps: DesktopOpenDeps = defaultDeps): Promise<boolean> {
  if (deps.platform !== 'darwin' || desktopAppDisabled(deps.env)) return false
  const link = desktopLinkFor(pageUrl) ?? desktopLinkFor(pageUrl, await (deps.cloudUrl ?? desktopCloudUrl)())
  if (!link) return false
  // `open` exits non-zero, without a dialog, when no installed app claims the scheme.
  return (await (deps.run ?? runQuietly)('open', [link])) === 0
}
