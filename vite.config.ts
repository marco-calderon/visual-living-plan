import { readFileSync } from 'node:fs'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { fileURLToPath } from 'node:url'

const PRECACHE_ASSET = /\.(?:js|mjs|css|wasm|woff2?|ttf|otf|png|jpe?g|gif|webp|avif|svg|ico)$/i

/** Lists the client build so the shell worker can precache it on install. */
function precacheManifestPlugin(): Plugin {
  return {
    name: 'living-plan-precache-manifest',
    apply: 'build',
    // After Vite's CSS step, which drops the empty JS chunk of a CSS-only import (hostToolbar.css).
    // Listed before that, the chunk 404s and fails its whole precache batch.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const name = this.environment?.name
      if (name && name !== 'client') return
      if (bundle['precache-manifest.json']) return
      const urls: string[] = []
      for (const item of Object.values(bundle)) {
        const fileName = item.fileName
        if (!fileName.startsWith('assets/') || fileName.endsWith('.map')) continue
        if (!PRECACHE_ASSET.test(fileName)) continue
        urls.push(`/${fileName}`)
      }
      urls.sort()
      const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
      this.emitFile({
        type: 'asset',
        fileName: 'precache-manifest.json',
        source: JSON.stringify({ version: pkg.version, urls }),
      })
    },
  }
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    dedupe: ['react', 'react-dom'],
    // Code is highlighted with Pierre's Highlights; Shiki is never loaded, so none of it is built or precached.
    alias: [{ find: /^shiki(\/.*)?$/, replacement: fileURLToPath(new URL('./client/noShiki.ts', import.meta.url)) }],
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
      '@yusufceng1z/ding-react',
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
