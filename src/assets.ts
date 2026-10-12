import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

type ViteManifest = Record<
  string,
  {
    file: string
    css?: string[]
    isEntry?: boolean
    name?: string
  }
>

export type ClientAssets = {
  jsHref: string
  cssHrefs: string[]
  mermaidHref: string | null
  mermaidCssHrefs: string[]
}

const here = dirname(fileURLToPath(import.meta.url))

function manifestEntry(manifest: ViteManifest, names: string[]): ViteManifest[string] | undefined {
  for (const name of names) {
    const entry = manifest[name]
    if (entry) return entry
  }
  return undefined
}

export async function loadClientAssets(): Promise<ClientAssets | null> {
  const manifestPath = join(here, '../dist/client/.vite/manifest.json')
  try {
    const raw = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(raw) as ViteManifest
    const entry =
      manifestEntry(manifest, ['client/main.tsx', 'main']) ??
      Object.values(manifest).find((item) => item.isEntry && item.name !== 'mermaid')

    if (!entry) return null
    const mermaid = manifestEntry(manifest, ['client/mermaid.ts', 'mermaid'])
    return {
      jsHref: `/client/${entry.file}`,
      cssHrefs: (entry.css ?? []).map((file) => `/client/${file}`),
      mermaidHref: mermaid ? `/client/${mermaid.file}` : null,
      mermaidCssHrefs: (mermaid?.css ?? []).map((file) => `/client/${file}`),
    }
  } catch {
    return null
  }
}

export function clientDistDir(): string {
  return join(here, '../dist/client')
}
