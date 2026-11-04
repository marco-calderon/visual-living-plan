/**
 * Install and home screen icons, generated from the Living Plan mark.
 * Regenerate with `npm run icons` (see scripts/pwa-icons/README.md).
 *
 * Files live in `public/icons/`. The hosted Worker serves them as static
 * assets. The local service reads the bytes in `pwaIconFile.ts`.
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
