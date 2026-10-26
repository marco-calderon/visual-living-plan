import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

const repoRoot = join(import.meta.dir, '..')
const cli = join(repoRoot, 'src', 'cli.ts')

async function packageVersion(): Promise<string> {
  const raw = await readFile(join(repoRoot, 'package.json'), 'utf8')
  const parsed = JSON.parse(raw) as { version?: string }
  assert.equal(typeof parsed.version, 'string')
  assert.ok(parsed.version)
  return parsed.version
}

function run(args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 15_000,
  })
}

test('--version and -v print the package version and exit', async () => {
  const version = await packageVersion()
  for (const args of [['--version'], ['-v'], ['serve', '--version']]) {
    const result = run(args)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, `${version}\n`)
    assert.equal(result.stderr, '')
  }
})
