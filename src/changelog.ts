import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

export type ChangelogEntry = {
  version: string
  text: string
}

export type ChangelogRelease = {
  fileName: string
  /** Versions in file order. */
  versions: string[]
  /** True when the file uses Bugs fixed / Improvements / New features. */
  classified: boolean
  bugs: ChangelogEntry[]
  improvements: ChangelogEntry[]
  features: ChangelogEntry[]
  /** Bullets still under `### Changes`. */
  changes: ChangelogEntry[]
}

const CHANGELOG_FILE = /^changelog-(\d{4}-\d{2}-\d{2})\.md$/

const HEADING_KIND = {
  'bugs fixed': 'bugs',
  improvements: 'improvements',
  'new features': 'features',
  changes: 'changes',
} as const

type HeadingKind = (typeof HEADING_KIND)[keyof typeof HEADING_KIND]

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
  const matches = names.filter((name) => CHANGELOG_FILE.test(name)).sort()
  const newest = matches.at(-1)
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

export function parseChangelog(markdown: string, fileName: string): ChangelogRelease | null {
  const bugs: ChangelogEntry[] = []
  const improvements: ChangelogEntry[] = []
  const features: ChangelogEntry[] = []
  const changes: ChangelogEntry[] = []
  const versions: string[] = []
  let classified = false

  for (const chunk of markdown.split(/^##\s+/m).slice(1)) {
    const headerEnd = chunk.indexOf('\n')
    const heading = (headerEnd === -1 ? chunk : chunk.slice(0, headerEnd)).trim()
    const version = /^(\d+\.\d+\.\d+)\b/.exec(heading)?.[1]
    if (!version) continue
    versions.push(version)
    const body = headerEnd === -1 ? '' : chunk.slice(headerEnd + 1)
    for (const part of body.split(/^###\s+/m).slice(1)) {
      const lineEnd = part.indexOf('\n')
      const title = (lineEnd === -1 ? part : part.slice(0, lineEnd)).trim().toLowerCase()
      const kind = HEADING_KIND[title as keyof typeof HEADING_KIND]
      if (!kind) continue
      const lines = bullets(lineEnd === -1 ? '' : part.slice(lineEnd + 1)).map((text) => ({ version, text }))
      if (kind === 'changes') changes.push(...lines)
      else {
        classified = true
        bucket(kind, lines, bugs, improvements, features)
      }
    }
  }

  if (!versions.length) return null
  if (!classified && changes.length === 0) return null
  return { fileName, versions, classified, bugs, improvements, features, changes }
}

function bucket(
  kind: Exclude<HeadingKind, 'changes'>,
  lines: ChangelogEntry[],
  bugs: ChangelogEntry[],
  improvements: ChangelogEntry[],
  features: ChangelogEntry[],
): void {
  if (kind === 'bugs') bugs.push(...lines)
  else if (kind === 'improvements') improvements.push(...lines)
  else features.push(...lines)
}

function bullets(section: string): string[] {
  const items: string[] = []
  let current: string | null = null
  const flush = () => {
    const text = current?.trim()
    if (text) items.push(text)
    current = null
  }
  for (const line of section.split('\n')) {
    if (/^#{1,6}\s/.test(line)) {
      flush()
      break
    }
    const match = /^[ \t]*[-*]\s+(.*)$/.exec(line)
    if (match) {
      flush()
      current = match[1]
      continue
    }
    if (current !== null && line.trim()) current += ` ${line.trim()}`
  }
  flush()
  return items
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Backtick spans become `<code>`. Everything else is escaped. */
function rich(text: string): string {
  const pieces = text.split('`')
  if (pieces.length % 2 === 0) return escapeHtml(text)
  return pieces.map((piece, index) => (index % 2 === 0 ? escapeHtml(piece) : `<code>${escapeHtml(piece)}</code>`)).join('')
}

function card(kind: string, label: string, lines: ChangelogEntry[]): string {
  const empty = lines.length === 0
  const body = empty
    ? '<p class="release-empty">None in this file.</p>'
    : `<ul class="release-list">${lines
        .map(
          (line) =>
            `<li><span class="ver">${escapeHtml(line.version)}</span><span>${rich(line.text)}</span></li>`,
        )
        .join('')}</ul>`
  return `<article class="release-card" data-kind="${kind}"${empty ? ' data-empty="true"' : ''}>
      <div class="release-stat">
        <div class="settings-kicker">${label}</div>
        <div class="release-count">${lines.length}</div>
      </div>
      ${body}
    </article>`
}

function shippedCopy(release: ChangelogRelease): string {
  const file = `<code>${escapeHtml(release.fileName)}</code>`
  const [first] = release.versions
  const last = release.versions.at(-1)
  if (!first || !last) return `Shipped in ${file}.`
  if (first === last) return `Shipped in ${file}, ${escapeHtml(first)}.`
  return `Shipped in ${file}, from ${escapeHtml(first)} through ${escapeHtml(last)}.`
}

/** Settings block for the newest changelog. Empty string when there is nothing to show. */
export function changelogSectionHtml(release: ChangelogRelease): string {
  const cards = release.classified
    ? [
        card('bugs', 'Bugs fixed', release.bugs),
        card('improvements', 'Improvements', release.improvements),
        card('features', 'New features', release.features),
        release.changes.length ? card('changes', 'Changes', release.changes) : '',
      ].join('')
    : card('changes', 'Changes', release.changes)
  return `<section class="block settings-section" data-section data-changelog>
          <h3>Changelog</h3>
          <p class="settings-copy">${shippedCopy(release)}</p>
          <div class="release-cards">
            ${cards}
          </div>
          <p class="settings-meta">Read from <code>docs/changelogs/${escapeHtml(release.fileName)}</code>.</p>
        </section>`
}
