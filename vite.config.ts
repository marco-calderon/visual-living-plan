import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Bundles are served under /client/* (see loadClientAssets / registry routes).
  // Without this, Vite's modulepreload helper prefixes chunk URLs as /assets/...,
  // which 404s on plan pages and floods the console during highlight/workflow loads.
  base: '/client/',
  plugins: [react()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'client/main.tsx'),
        mermaid: resolve(rootDir, 'client/mermaid.ts'),
        highlight: resolve(rootDir, 'client/highlight.tsx'),
        selector: resolve(rootDir, 'client/PlanSelector.tsx'),
        planMdx: resolve(rootDir, 'client/planMdx.tsx'),
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
