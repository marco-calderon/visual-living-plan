import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { defineConfig } from 'vite'

const dir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      react: resolve(dir, 'node_modules/react'),
      'react-dom': resolve(dir, 'node_modules/react-dom'),
    },
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
    fs: {
      allow: [resolve(dir, '..')],
    },
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    viteReact(),
    {
      name: 'resolve-client-deps',
      async resolveId(source, importer, options) {
        if (!importer || source.startsWith('.') || source.startsWith('\0') || source.startsWith('/') || source.startsWith('\u0000')) return null
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
        if (resolved) return resolved
        if (!importer.includes('/client/') && !importer.includes('/src/')) return null
        try {
          return fileURLToPath(import.meta.resolve(source, pathToFileURL(resolve(dir, 'package.json'))))
        } catch {
          return null
        }
      },
    },
  ],
})
