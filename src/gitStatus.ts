import { spawnSync } from 'node:child_process'
import type { GitSnapshot } from './processRecord.js'
import { emptyGitSnapshot } from './processRecord.js'

export function formatGitSummary(snapshot: GitSnapshot): string {
  if (!snapshot.isRepo) return 'not a git repository'
  const head = [snapshot.branch ?? 'detached', snapshot.commit ? `@ ${snapshot.commit}` : '']
    .filter(Boolean)
    .join(' ')
  const state = snapshot.dirty
    ? `dirty · ${snapshot.changedFiles} ${snapshot.changedFiles === 1 ? 'file' : 'files'}`
    : 'clean'
  const tracking = [
    snapshot.ahead > 0 ? `ahead ${snapshot.ahead}` : '',
    snapshot.behind > 0 ? `behind ${snapshot.behind}` : '',
  ].filter(Boolean)
  return [head, state, ...tracking].join(' · ')
}

/**
 * `git status --porcelain=v1 -b` plus a commit id.
 * The branch line looks like `## main...origin/main [ahead 1, behind 2]`.
 */
export function parseGitPorcelain(
  porcelain: string,
  options: { root: string; commit: string | null },
): GitSnapshot {
  const lines = porcelain.split('\n').filter((line) => line.length > 0)
  const branchLine = lines.find((line) => line.startsWith('## ')) ?? ''
  const head = branchLine.slice(3).trim()
  let branch: string | null = null
  if (head.startsWith('HEAD (no branch)')) {
    branch = null
  } else if (head.startsWith('No commits yet on ')) {
    branch = head.slice('No commits yet on '.length).trim() || null
  } else if (head.length > 0) {
    branch = head.split('...')[0]?.trim() || null
  }

  const changed = lines.filter((line) => !line.startsWith('## '))
  const snapshot: GitSnapshot = {
    isRepo: true,
    root: options.root,
    branch,
    commit: options.commit,
    dirty: changed.length > 0,
    ahead: Number(/ahead (\d+)/.exec(head)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(head)?.[1] ?? 0),
    changedFiles: changed.length,
    changedPaths: changed
      .map((line) => line.slice(3).trim())
      .filter(Boolean)
      .slice(0, 12),
    summary: '',
  }
  snapshot.summary = formatGitSummary(snapshot)
  return snapshot
}

function runGit(cwd: string, args: string[]): { ok: boolean; stdout: string; missing: boolean } {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 4_000,
    windowsHide: true,
  })
  const code = result.error && 'code' in result.error ? result.error.code : ''
  if (code === 'ENOENT') {
    return { ok: false, stdout: '', missing: true }
  }
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    missing: false,
  }
}

/** Git status for the directory a plan is linked to. Never throws. */
export function readGitSnapshot(directory: string): GitSnapshot {
  const top = runGit(directory, ['rev-parse', '--show-toplevel'])
  if (top.missing) return emptyGitSnapshot('git is not available')
  if (!top.ok) return emptyGitSnapshot('not a git repository')

  const root = top.stdout.trim()
  const status = runGit(root, ['status', '--porcelain=v1', '-b', '--untracked-files=normal'])
  if (!status.ok) return emptyGitSnapshot('not a git repository')
  const commit = runGit(root, ['rev-parse', '--short', 'HEAD'])
  return parseGitPorcelain(status.stdout, {
    root,
    commit: commit.ok ? commit.stdout.trim() || null : null,
  })
}
