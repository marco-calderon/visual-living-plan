import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

// `npm install -g github:...` leaks the global prefix into this script.
// Dependencies then land in the global folder, and `tsc` is not on PATH.
function localEnv() {
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
    env: localEnv(),
  })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const tsc = join(root, 'node_modules/typescript/lib/tsc.js')
const vite = join(root, 'node_modules/vite/bin/vite.js')

if (!existsSync(tsc) || !existsSync(vite)) {
  run('npm', ['install', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund'])
}

run(process.execPath, [tsc, '-p', join(root, 'tsconfig.json')])
run(process.execPath, [vite, 'build'])
chmodSync(join(root, 'dist/cli.js'), 0o755)
