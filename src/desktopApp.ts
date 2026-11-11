/**
 * Open a page in the Living Plan desktop app when it is installed ([ADR 0037]).
 *
 * The app (`src-tauri/`) registers the `living-plan` URL scheme:
 *
 *   living-plan://plans/<id>   that plan, on this machine's plan service
 *   living-plan://dashboard    the dashboard
 *
 * Only pages on the local service have a link, because the app is a window on that service. A
 * hosted plan, a private `--no-registry` server, and a LAN or `--host` address open in the browser.
 * The app ships for macOS only for now, so other platforms always use the browser.
 *
 * [ADR 0037]: ../docs/architecture/decisions/0037-plans-open-in-the-desktop-app.md
 */
import { spawn } from 'node:child_process'
import { isLoopbackHost } from './localName'

export const DESKTOP_SCHEME = 'living-plan'

/** Plan ids are a hash of the plan path. The app accepts the same characters. */
const PLAN_ID = /^[A-Za-z0-9_-]{1,128}$/

/** The `living-plan://` link for a page on the local service, or null when the app cannot show it. */
export function desktopLinkFor(pageUrl: string): string | null {
  let url: URL
  try {
    url = new URL(pageUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' || !isLoopbackHost(url.hostname)) return null
  if (url.pathname === '/dashboard' || url.pathname === '/dashboard/') return `${DESKTOP_SCHEME}://dashboard`
  const id = url.pathname.match(/^\/plans\/([^/]+)\/?$/)?.[1]
  if (!id || !PLAN_ID.test(id)) return null
  return `${DESKTOP_SCHEME}://plans/${id}`
}

/** `LIVE_PLAN_DESKTOP=0` (or `off`, `false`, `no`) keeps every page in the browser. */
export function desktopAppDisabled(env: NodeJS.ProcessEnv): boolean {
  const value = env.LIVE_PLAN_DESKTOP?.trim().toLowerCase()
  return value === '0' || value === 'off' || value === 'false' || value === 'no'
}

export type DesktopOpenDeps = {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  /** Run a command with no output and resolve its exit code, or null when it could not run. */
  run: (command: string, args: string[]) => Promise<number | null>
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
 * turned off, or it is not installed, so the caller opens the browser instead.
 */
export async function openInDesktopApp(pageUrl: string, deps: DesktopOpenDeps = defaultDeps): Promise<boolean> {
  const link = desktopLinkFor(pageUrl)
  if (!link || desktopAppDisabled(deps.env)) return false
  if (deps.platform !== 'darwin') return false
  // `open` exits non-zero, without a dialog, when no installed app claims the scheme.
  return (await deps.run('open', [link])) === 0
}
