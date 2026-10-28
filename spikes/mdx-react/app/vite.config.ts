import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const appDir = dirname(fileURLToPath(import.meta.url))
const spikeDir = resolve(appDir, '..')
const repoRoot = resolve(spikeDir, '../..')
const spikePort = process.env.MDX_SPIKE_PORT ?? '9488'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: resolve(appDir, 'node_modules/react'),
      'react-dom': resolve(appDir, 'node_modules/react-dom'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5199,
    strictPort: true,
    fs: {
      allow: [repoRoot],
    },
    proxy: {
      '/events': {
        target: `http://127.0.0.1:${spikePort}`,
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
      '/api': {
        target: `http://127.0.0.1:${spikePort}`,
        changeOrigin: true,
      },
    },
  },
})
