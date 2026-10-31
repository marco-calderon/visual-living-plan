import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
  plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), tanstackStart(), viteReact()],
})
