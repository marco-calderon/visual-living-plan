/** Loopback Settings: read the version and changelog from disk each time the page renders. */
import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { newestChangelogName, parseChangelog, type ChangelogRelease } from './changelogParse'

export * from './changelogParse'

/** Directory of changelog files next to a source or dist entry file. */
export function changelogDirectory(entryFile: string): string {
  return join(resolve(dirname(entryFile), '..'), 'docs', 'changelogs')
}

/** Newest `changelog-yyyy-mm-dd.md` by the date in the name. */
export function latestChangelogPath(directory: string): string | null {
  let names: string[]
  try {
    names = readdirSync(directory)
  } catch {
    return null
  }
  const newest = newestChangelogName(names)
  return newest ? join(directory, newest) : null
}

export function loadLatestChangelog(entryFile: string): ChangelogRelease | null {
  const path = latestChangelogPath(changelogDirectory(entryFile))
  if (!path) return null
  try {
    return parseChangelog(readFileSync(path, 'utf8'), basename(path))
  } catch {
    return null
  }
}

/** `version` from the package.json next to a source or dist entry file. */
export function loadPackageVersion(entryFile: string): string | null {
  try {
    const raw = readFileSync(join(resolve(dirname(entryFile), '..'), 'package.json'), 'utf8')
    const version = (JSON.parse(raw) as { version?: unknown }).version
    return typeof version === 'string' && version ? version : null
  } catch {
    return null
  }
}
