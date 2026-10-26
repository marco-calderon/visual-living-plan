import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const faviconPath = join(dirname(fileURLToPath(import.meta.url)), 'favicon.png')

export const faviconLink = '<link rel="icon" type="image/png" href="/favicon.png" />'

export function faviconResponse(): Response {
  const body = readFileSync(faviconPath)
  return new Response(body, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=86400',
    },
  })
}
