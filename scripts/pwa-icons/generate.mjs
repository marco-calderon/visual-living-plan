import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Regenerate public/icons/ with @vite-pwa/assets-generator.
 *
 * Sources:
 * - src/favicon.png: the logo (white round tile). Used for "any" icons and favicons.
 * - scripts/pwa-icons/mark.png: the same mark cropped, on transparent. Used for
 *   maskable and Apple touch icons, which get a white square background.
 */
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const work = join(here, 'work')
const out = join(root, 'public/icons')

rmSync(work, { recursive: true, force: true })
mkdirSync(join(work, 'tile'), { recursive: true })
mkdirSync(join(work, 'mark'), { recursive: true })
copyFileSync(join(root, 'src/favicon.png'), join(work, 'tile/logo.png'))
copyFileSync(join(here, 'mark.png'), join(work, 'mark/logo.png'))

for (const config of ['tile.config.mjs', 'mark.config.mjs']) {
  const result = spawnSync('npx', ['-y', '@vite-pwa/assets-generator@1.0.0', '--config', config], {
    cwd: here,
    stdio: 'inherit',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

mkdirSync(out, { recursive: true })
for (const dir of ['tile', 'mark']) {
  for (const name of readdirSync(join(work, dir))) {
    if (name === 'logo.png') continue
    copyFileSync(join(work, dir, name), join(out, name))
  }
}
rmSync(work, { recursive: true, force: true })
console.log(`Icons written to ${out}`)
