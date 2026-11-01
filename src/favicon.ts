import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { faviconBase64 } from './faviconBase64.ts'

function embeddedFavicon(): Uint8Array {
  const binary = atob(faviconBase64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function faviconFromFile(): Uint8Array | undefined {
  const moduleUrl = import.meta.url
  if (!moduleUrl) return undefined
  try {
    const faviconPath = join(dirname(fileURLToPath(moduleUrl)), 'favicon.png')
    return new Uint8Array(readFileSync(faviconPath))
  } catch {
    return undefined
  }
}

export const faviconLink = '<link rel="icon" type="image/png" href="/favicon.png" />'

export function faviconResponse(): Response {
  const body = faviconFromFile() ?? embeddedFavicon()
  return new Response(body, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=86400',
    },
  })
}

/** Title bars request `/favicon.png`. An HTML document from the app shell is a broken image. */
export async function faviconFromAsset(asset: Response | null | undefined): Promise<Response> {
  const type = asset?.headers.get('content-type') ?? ''
  if (asset?.ok && type.startsWith('image/')) return asset
  return faviconResponse()
}
