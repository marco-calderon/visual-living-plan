import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const PRECACHE_ASSET = /\.(?:js|mjs|css|wasm|woff2?|ttf|otf|png|jpe?g|gif|webp|avif|svg|ico)$/i

/** Lists files actually written under client `assets/`, so a CSS-only chunk that Vite drops is not precached. */
function precacheManifestPlugin(): Plugin {
  return {
    name: 'living-plan-precache-manifest',
    apply: 'build',
    writeBundle(options) {
      const name = this.environment?.name
      if (name && name !== 'client') return
      const dir = options.dir
      if (!dir) return
      const assetsDir = join(dir, 'assets')
      let names: string[] = []
      try {
        names = readdirSync(assetsDir)
      } catch {
        names = []
      }
      const urls = names
        .filter((file) => PRECACHE_ASSET.test(file) && !file.endsWith('.map'))
        .filter((file) => {
          try {
            return statSync(join(assetsDir, file)).isFile()
          } catch {
            return false
          }
        })
        .map((file) => `/assets/${file}`)
        .sort()
      const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
      writeFileSync(join(dir, 'precache-manifest.json'), JSON.stringify({ version: pkg.version, urls }))
    },
  }
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    dedupe: ['react', 'react-dom'],
  },
  ssr: {
    noExternal: ['yaml', 'winston', 'winston-daily-rotate-file'],
  },
  optimizeDeps: {
    include: [
      '@xyflow/react',
      '@mdx-js/mdx',
      '@base-ui/react/menu',
      '@base-ui/react/popover',
      '@base-ui/react/switch',
      '@base-ui/react/checkbox',
      '@base-ui/react/collapsible',
      '@base-ui/react/radio',
      '@base-ui/react/radio-group',
      '@base-ui/react/select',
      '@base-ui/react/number-field',
      '@base-ui/react/button',
      'use-sync-external-store/shim/index.js',
      'use-sync-external-store/shim/with-selector.js',
      'lucide-react',
      'sonner',
      'elkjs/lib/elk.bundled.js',
      '@pierre/diffs/react',
      '@tanstack/react-table',
      '@tanstack/charts',
      '@tanstack/charts/react',
      'pele',
      '@panzoom/panzoom',
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart({ server: { entry: 'startServer' } }),
    viteReact(),
    precacheManifestPlugin(),
  ],
})
