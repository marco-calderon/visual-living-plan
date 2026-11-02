/**
 * Web app manifest for the hosted app and the local plan service.
 *
 * With the shell worker at `/sw.js`, this makes both installable from the
 * browser's own install prompt on a secure origin (HTTPS or loopback).
 */

export const WEB_MANIFEST_PATH = '/manifest.webmanifest'

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
  icons: Array<{ src: string; sizes: string; type: string; purpose: string }>
}

export function webManifest(): WebManifest {
  return {
    id: '/',
    name: 'Living Plan',
    short_name: 'Living Plan',
    description: 'Agent-authored living plans you can follow, answer, and review.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: THEME_COLOR_LIGHT,
    theme_color: THEME_COLOR_LIGHT,
    icons: [{ src: '/favicon.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' }],
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

/** Head tags for every app page: manifest, theme color, and the home screen icon. */
export const webManifestHead = [
  `<link rel="manifest" href="${WEB_MANIFEST_PATH}" />`,
  `<meta name="theme-color" content="${THEME_COLOR_LIGHT}" media="(prefers-color-scheme: light)" />`,
  `<meta name="theme-color" content="${THEME_COLOR_DARK}" media="(prefers-color-scheme: dark)" />`,
  '<link rel="apple-touch-icon" href="/favicon.png" />',
].join('\n  ')
