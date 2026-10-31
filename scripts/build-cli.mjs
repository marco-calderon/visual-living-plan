import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * Build dist/ for `npm run build`, `prepack`, and local global install
 * (`npm run install:global` → `npm install -g .`).
 *
 * 1. Install build tools into this package if they are missing
 * 2. Compile TypeScript
 * 3. Copy the favicon into dist/
 * 4. Bundle the Vite client
 * 5. Mark dist/cli.js executable
 *
 * `npm install -g` can leak a global prefix into child processes. Strip those
 * vars so deps land in this package’s node_modules, not the global folder.
 */
function envWithoutGlobalNpm() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^(npm_config_prefix|npm_config_global|npm_config_production|NODE_ENV)$/i.test(key)) {
      delete env[key]
    }
  }
  return env
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: envWithoutGlobalNpm(),
  })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const tsc = join(root, 'node_modules/typescript/lib/tsc.js')
const vite = join(root, 'node_modules/vite/bin/vite.js')

// 1. Build tools (needed when packing from a sparse checkout / global install)
if (!existsSync(tsc) || !existsSync(vite)) {
  run('npm', ['install', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund'])
}

// 2. TypeScript → dist/
run(process.execPath, [tsc, '-p', join(root, 'tsconfig.json')])

// 3. Favicon next to the compiled CLI
copyFileSync(join(root, 'src/favicon.png'), join(root, 'dist/favicon.png'))

// 4. Client bundle
run(process.execPath, [vite, 'build', '--config', join(root, 'vite.client.config.ts')])

// 5. Executable bit for the bin entry
chmodSync(join(root, 'dist/cli.js'), 0o755)
