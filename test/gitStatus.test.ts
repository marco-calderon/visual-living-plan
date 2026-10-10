import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { formatGitSummary, parseGitPorcelain, readGitSnapshot } from '../src/gitStatus.ts'

test('parseGitPorcelain reads branch, ahead/behind, and dirty paths', () => {
  const snapshot = parseGitPorcelain(
    ['## main...origin/main [ahead 2, behind 1]', ' M src/cli.ts', '?? note.txt', ''].join('\n'),
    { root: '/work', commit: 'abc1234' },
  )
  assert.equal(snapshot.isRepo, true)
  assert.equal(snapshot.branch, 'main')
  assert.equal(snapshot.commit, 'abc1234')
  assert.equal(snapshot.ahead, 2)
  assert.equal(snapshot.behind, 1)
  assert.equal(snapshot.dirty, true)
  assert.equal(snapshot.changedFiles, 2)
  assert.deepEqual(snapshot.changedPaths, ['src/cli.ts', 'note.txt'])
  assert.equal(snapshot.summary, formatGitSummary(snapshot))
  assert.match(snapshot.summary, /main @ abc1234 · dirty · 2 files · ahead 2 · behind 1/)
})

test('readGitSnapshot reports a dirty file in a repository', () => {
  const directory = mkdtempSync(join(tmpdir(), 'live-plan-git-'))
  try {
    const git = (args: string[]) => {
      execFileSync('git', args, { cwd: directory, stdio: 'ignore' })
    }
    git(['init', '-b', 'main'])
    git(['config', 'user.email', 'test@example.com'])
    git(['config', 'user.name', 'Test'])
    writeFileSync(join(directory, 'README.md'), 'hello\n')
    git(['add', 'README.md'])
    git(['commit', '-m', 'init'])
    writeFileSync(join(directory, 'note.txt'), 'dirty\n')

    const snapshot = readGitSnapshot(directory)
    assert.equal(snapshot.isRepo, true)
    assert.equal(snapshot.branch, 'main')
    assert.equal(snapshot.dirty, true)
    assert.ok(snapshot.changedFiles >= 1)
    assert.ok(snapshot.changedPaths.some((path) => path.includes('note.txt')))
    assert.match(snapshot.summary, /dirty/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('readGitSnapshot reports a directory that is not a repository', () => {
  const directory = mkdtempSync(join(tmpdir(), 'live-plan-not-git-'))
  try {
    const snapshot = readGitSnapshot(directory)
    assert.equal(snapshot.isRepo, false)
    assert.equal(snapshot.dirty, false)
    assert.match(snapshot.summary, /not a git repository/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
