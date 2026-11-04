import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pwaIconName } from './pwaIcons.ts'

/**
 * Disk reads for the local plan service. The hosted Worker serves the same
 * files as static assets, and the browser only needs the paths in `pwaIcons.ts`.
 *
 * Look beside this module (`dist/icons/` after the CLI build) and then in
 * `public/icons/` when the service runs from source.
 */

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
