import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const script = join(repoRoot, 'scripts', 'install-skills.mjs')

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

function run(dest: string) {
  return spawnSync(process.execPath, [script], {
    cwd: repoRoot,
    env: { ...process.env, LIVE_PLAN_SKILLS_DIR: dest },
    encoding: 'utf8',
  })
}

test('install-skills copies project skills into the destination and can run again', () => {
  const dest = mkdtempSync(join(tmpdir(), 'live-plan-skills-'))
  try {
    const other = join(dest, 'other-skill')
    mkdirSync(other, { recursive: true })
    writeFileSync(join(other, 'SKILL.md'), 'leave this skill alone\n')

    const first = run(dest)
    assert.equal(first.status, 0, first.stderr)
    assert.match(first.stdout, new RegExp(`Installed live-plan to ${join(dest, 'live-plan')}`))
    assert.match(first.stdout, /Installed living-plan to /)
    assert.match(first.stdout, /Installed version-bump to /)

    const livePlan = join(dest, 'live-plan', 'SKILL.md')
    const primitives = join(dest, 'live-plan', 'primitives.md')
    assert.equal(read(livePlan), read(join(repoRoot, 'skills', 'live-plan', 'SKILL.md')))
    assert.equal(read(primitives), read(join(repoRoot, 'skills', 'live-plan', 'primitives.md')))
    assert.equal(
      read(join(dest, 'living-plan', 'SKILL.md')),
      read(join(repoRoot, 'skills', 'living-plan', 'SKILL.md')),
    )
    assert.equal(
      read(join(dest, 'version-bump', 'SKILL.md')),
      read(join(repoRoot, '.cursor', 'skills', 'version-bump', 'SKILL.md')),
    )
    assert.equal(read(join(other, 'SKILL.md')), 'leave this skill alone\n')
    assert.doesNotMatch(first.stdout, /animate/)

    writeFileSync(join(dest, 'live-plan', 'extra.txt'), 'stale\n')
    const second = run(dest)
    assert.equal(second.status, 0, second.stderr)
    assert.equal(read(livePlan), read(join(repoRoot, 'skills', 'live-plan', 'SKILL.md')))
    assert.throws(() => read(join(dest, 'live-plan', 'extra.txt')))
    assert.equal(read(join(other, 'SKILL.md')), 'leave this skill alone\n')
  } finally {
    rmSync(dest, { recursive: true, force: true })
  }
})
