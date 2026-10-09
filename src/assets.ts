import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

type ViteManifest = Record<
  string,
  {
    file: string
    css?: string[]
    isEntry?: boolean
  }
>

const here = dirname(fileURLToPath(import.meta.url))

export async function loadClientAssets(): Promise<{ jsHref: string; cssHrefs: string[] } | null> {
  const manifestPath = join(here, '../dist/client/.vite/manifest.json')
  try {
    const raw = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(raw) as ViteManifest
    const entry =
      manifest['client/main.tsx'] ??
      Object.values(manifest).find((item) => item.isEntry)

    if (!entry) return null
    return {
      jsHref: `/client/${entry.file}`,
      cssHrefs: (entry.css ?? []).map((file) => `/client/${file}`),
    }
  } catch {
    return null
  }
}

export function clientDistDir(): string {
  return join(here, '../dist/client')
}
