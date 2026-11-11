/**
 * Web app manifest for the hosted app and the local plan service.
 *
 * With the shell worker at `/sw.js`, this makes both installable from the
 * browser's own install prompt on a secure origin (HTTPS or loopback).
 *
 * Once installed, the app claims links into its scope: a plan the CLI opens in
 * the browser, when the desktop app is not installed, opens in its own app
 * window instead of a tab (`handle_links`, `launch_handler`). A browser without
 * link capturing, or with it turned off, opens a new tab as before.
 */

import { manifestIcons, pwaIconHead, type ManifestIcon } from './pwaIcons'

export const WEB_MANIFEST_PATH = '/manifest.webmanifest'

/** Stable app identity. The CLI derives the installed app's id from it (`src/openUrl.ts`). */
export const WEB_MANIFEST_ID = '/'

export const THEME_COLOR_LIGHT = '#ffffff'
export const THEME_COLOR_DARK = '#171717'

export type WebManifest = {
  id: string
  name: string
  short_name: string
  description: string
  start_url: string
  scope: string
  display: 'standalone'
  background_color: string
  theme_color: string
  icons: ManifestIcon[]
  /** Open in-scope links in the installed app (Chromium link capturing). */
  handle_links: 'preferred'
  /** Each launch, such as a plan the CLI opened, gets its own app window. */
  launch_handler: { client_mode: Array<'navigate-new' | 'navigate-existing' | 'focus-existing' | 'auto'> }
}

export function webManifest(): WebManifest {
  return {
    id: WEB_MANIFEST_ID,
    name: 'Living Plan',
    short_name: 'Living Plan',
    description: 'Agent-authored living plans you can follow, answer, and review.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: THEME_COLOR_LIGHT,
    theme_color: THEME_COLOR_LIGHT,
    icons: manifestIcons,
    handle_links: 'preferred',
    launch_handler: { client_mode: ['navigate-new', 'auto'] },
  }
}

export function webManifestResponse(): Response {
  return new Response(JSON.stringify(webManifest()), {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'no-cache',
    },
  })
}

/** Head tags for every app page: manifest, theme color, tab icons, and the home screen icon. */
export const webManifestHead = [
  `<link rel="manifest" href="${WEB_MANIFEST_PATH}" />`,
  `<meta name="theme-color" content="${THEME_COLOR_LIGHT}" media="(prefers-color-scheme: light)" />`,
  `<meta name="theme-color" content="${THEME_COLOR_DARK}" media="(prefers-color-scheme: dark)" />`,
  pwaIconHead,
].join('\n  ')
