/**
 * What's new: the release notes the desktop app shows once after it moves to a newer minor version
 * ([ADR 0042]). No file system here; `src/changelog.ts` reads the files.
 *
 * The app records the version whose notes were last seen as `notesSeen` in `desktop.json`. A launch
 * whose `major.minor` is past that one shows every release after it, up to the running version. A
 * patch release alone shows nothing. Without a record, the notes start at this minor's `.0`.
 *
 * [ADR 0042]: ../docs/architecture/decisions/0042-update-notices-and-whats-new.md
 */
import type { VersionNotes } from './changelogParse'

export type { VersionNotes }

export type WhatsNew = {
  /** The running version. Recorded as `notesSeen` once the notes are closed. */
  version: string
  /** Newest first. Never empty. */
  releases: VersionNotes[]
  /** Releases left out to keep the notes short. */
  omitted: number
}

/** The notes show at most this many releases, newest first. */
export const WHATS_NEW_RELEASES = 8

type Triple = [number, number, number]

/** `x.y.z` as numbers, ignoring anything after the patch. */
export function parseVersion(version: string | null | undefined): Triple | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version ?? '')
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

export function compareVersions(a: Triple, b: Triple): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

/** True when `version` is a later `major.minor` than `seen`. */
export function isNewerMinor(version: string, seen: string): boolean {
  const next = parseVersion(version)
  const last = parseVersion(seen)
  if (!next || !last) return false
  return next[0] > last[0] || (next[0] === last[0] && next[1] > last[1])
}

/** Whether `version` has notes to show, given the version whose notes were last seen. */
export function notesDue(version: string, seen: string | null): boolean {
  if (!parseVersion(version)) return false
  return seen === null || isNewerMinor(version, seen)
}

/**
 * The notes to show at `version`, or null. `seen` is the version whose notes were last seen.
 * `releases` is every version section from every changelog file, in any order.
 */
export function whatsNew(version: string, seen: string | null, releases: readonly VersionNotes[]): WhatsNew | null {
  const current = parseVersion(version)
  if (!current || !notesDue(version, seen)) return null
  const last = parseVersion(seen)
  // Without a record, the notes begin at this minor's first release.
  const floor: Triple = last ?? [current[0], current[1], 0]
  const inclusive = last === null
  const byVersion = new Map<string, { triple: Triple; notes: VersionNotes }>()
  for (const notes of releases) {
    const triple = parseVersion(notes.version)
    if (!triple || byVersion.has(notes.version)) continue
    if (compareVersions(triple, current) > 0) continue
    const fromFloor = compareVersions(triple, floor)
    if (fromFloor < 0 || (fromFloor === 0 && !inclusive)) continue
    if (!hasNotes(notes)) continue
    byVersion.set(notes.version, { triple, notes })
  }
  const sorted = [...byVersion.values()].sort((a, b) => compareVersions(b.triple, a.triple)).map((entry) => entry.notes)
  if (!sorted.length) return null
  return {
    version,
    releases: sorted.slice(0, WHATS_NEW_RELEASES),
    omitted: Math.max(0, sorted.length - WHATS_NEW_RELEASES),
  }
}

function hasNotes(notes: VersionNotes): boolean {
  return Boolean(notes.summary || notes.features.length || notes.improvements.length || notes.bugs.length || notes.changes.length)
}
