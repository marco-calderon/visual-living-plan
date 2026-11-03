import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Install and home screen icons, generated from the Living Plan mark.
 * Regenerate with `npm run icons` (see scripts/pwa-icons/README.md).
 *
 * Files live in `public/icons/`. The hosted Worker serves them as static
 * assets. The local service reads them from `dist/icons/` (copied at build)
 * or `public/icons/` when it runs from source.
 */

export const PWA_ICONS_PATH = '/icons/'

export type ManifestIcon = { src: string; sizes: string; type: string; purpose: 'any' | 'maskable' }

/** `any` icons are the round white logo. `maskable` icons fill the square for Android launchers. */
export const manifestIcons: ManifestIcon[] = [
  { src: '/icons/pwa-64x64.png', sizes: '64x64', type: 'image/png', purpose: 'any' },
  { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icons/maskable-icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: '/icons/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
]

/** iOS and iPadOS home screen icon. Opaque, since iOS fills transparency with black. */
export const APPLE_TOUCH_ICON = '/icons/apple-touch-icon-180x180.png'

/** Tab icons. Browsers that ask for `/favicon.ico` without a link get the same file. */
export const FAVICON_ICO = '/icons/favicon.ico'
export const FAVICON_32 = '/icons/pwa-32x32.png'
export const FAVICON_16 = '/icons/pwa-16x16.png'

const ICON_FILE = /^[a-z0-9-]+\.(png|ico)$/

/** The file name under `/icons/`, or undefined for any other path. */
export function pwaIconName(pathname: string): string | undefined {
  if (pathname === '/favicon.ico') return 'favicon.ico'
  if (!pathname.startsWith(PWA_ICONS_PATH)) return undefined
  const name = pathname.slice(PWA_ICONS_PATH.length)
  return ICON_FILE.test(name) ? name : undefined
}

function iconContentType(name: string): string {
  return name.endsWith('.ico') ? 'image/x-icon' : 'image/png'
}

function readIcon(name: string): Uint8Array<ArrayBuffer> | undefined {
  const moduleUrl = import.meta.url
  if (!moduleUrl) return undefined
  const here = dirname(fileURLToPath(moduleUrl))
  for (const dir of [join(here, 'icons'), join(here, '../public/icons')]) {
    try {
      return new Uint8Array(readFileSync(join(dir, name)))
    } catch {
      // try the next location
    }
  }
  return undefined
}

/** Local service: serve a generated icon, or 404. */
export function pwaIconResponse(pathname: string): Response {
  const name = pwaIconName(pathname)
  const body = name ? readIcon(name) : undefined
  if (!name || !body) return new Response('Not found', { status: 404 })
  return new Response(body, {
    headers: {
      'content-type': iconContentType(name),
      'cache-control': 'public, max-age=86400',
    },
  })
}

/** Hosted Worker: keep the static asset only when it is an image. */
export function pwaIconFromAsset(asset: Response | null | undefined): Response {
  const type = asset?.headers.get('content-type') ?? ''
  if (asset?.ok && type.startsWith('image/')) return asset
  return new Response('Not found', { status: 404 })
}

/** Head tags for tab icons and the iOS home screen icon. */
export const pwaIconHead = [
  `<link rel="icon" href="${FAVICON_ICO}" sizes="48x48" />`,
  `<link rel="icon" type="image/png" href="${FAVICON_32}" sizes="32x32" />`,
  `<link rel="icon" type="image/png" href="${FAVICON_16}" sizes="16x16" />`,
  `<link rel="apple-touch-icon" href="${APPLE_TOUCH_ICON}" />`,
].join('\n  ')
