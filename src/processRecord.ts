export type GitSnapshot = {
  isRepo: boolean
  root: string | null
  branch: string | null
  commit: string | null
  dirty: boolean
  ahead: number
  behind: number
  changedFiles: number
  changedPaths: string[]
  summary: string
}

export type ProcessRecord = {
  id: string
  pid: number
  title: string
  summary: string | null
  agent: string | null
  mode: 'watch' | 'review'
  planPath: string
  directory: string
  cwd: string
  url: string
  host: string
  port: number
  startedAt: number
  heartbeatAt: number
  pendingCount: number
  executionActive: boolean
  executionStep: string | null
  git: GitSnapshot
}

export type ProcessRegistration = {
  id: string
  pid: number
  title: string
  summary?: string | null
  agent?: string | null
  mode: 'watch' | 'review'
  planPath: string
  directory: string
  cwd: string
  url: string
  host: string
  port: number
  pendingCount?: number
  executionActive?: boolean
  executionStep?: string | null
  git?: GitSnapshot
}

export type ProcessPulse = {
  at?: number
  title?: string
  summary?: string | null
  agent?: string | null
  pendingCount?: number
  executionActive?: boolean
  executionStep?: string | null
  git?: GitSnapshot
}

export function emptyGitSnapshot(summary = 'not a git repository'): GitSnapshot {
  return {
    isRepo: false,
    root: null,
    branch: null,
    commit: null,
    dirty: false,
    ahead: 0,
    behind: 0,
    changedFiles: 0,
    changedPaths: [],
    summary,
  }
}
