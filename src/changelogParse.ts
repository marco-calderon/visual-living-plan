/** Changelog parsing and the Settings Version card. No file system, so the hosted app can use it too. */

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

export const CHANGELOG_FILE = /^changelog-(\d{4}-\d{2}-\d{2})\.md$/

const HEADING_KIND = {
  'bugs fixed': 'bugs',
  improvements: 'improvements',
  'new features': 'features',
  changes: 'changes',
} as const

type HeadingKind = (typeof HEADING_KIND)[keyof typeof HEADING_KIND]

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
    : `<ul class="release-list">${lines.map((line) => `<li>${rich(line.text)}</li>`).join('')}</ul>`
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

function changelogHtml(release: ChangelogRelease, source: ReleaseSource): string {
  const cards = release.classified
    ? [
        card('bugs', 'Bugs fixed', release.bugs),
        card('improvements', 'Improvements', release.improvements),
        card('features', 'New features', release.features),
        release.changes.length ? card('changes', 'Changes', release.changes) : '',
      ].join('')
    : card('changes', 'Changes', release.changes)
  return `<div class="settings-version-changelog" data-changelog>
            <h4 class="settings-kicker">Changelog</h4>
            <p class="settings-copy">${shippedCopy(release)}</p>
            <div class="release-cards">
              ${cards}
            </div>
            <p class="settings-meta">${source === 'local' ? 'Read from' : 'Built in from'} <code>docs/changelogs/${escapeHtml(release.fileName)}</code>.</p>
          </div>`
}

/** Where Settings got its version and changelog. Only the wording differs. */
export type ReleaseSource = 'local' | 'hosted'

const VERSION_NOTE: Record<ReleaseSource, string> = {
  local: 'The package installed on this machine.',
  hosted: 'The build deployed to this host.',
}

/**
 * Settings card with the version and the newest changelog. Sits last in Settings.
 * Empty string when there is nothing to show.
 */
export function versionSectionHtml(
  version: string | null | undefined,
  release: ChangelogRelease | null | undefined,
  source: ReleaseSource = 'local',
): string {
  if (!version && !release) return ''
  const versionLine = version
    ? `<p class="settings-copy">Living Plan <strong data-app-version>${escapeHtml(version)}</strong>. ${VERSION_NOTE[source]}</p>`
    : ''
  return `<section class="block settings-section" data-section data-version-section data-release-source="${source}">
          <h3>Version</h3>
          ${versionLine}
          ${release ? changelogHtml(release, source) : ''}
        </section>`
}

/** Newest `changelog-yyyy-mm-dd.md` among paths or names, by the date in the name. */
export function newestChangelogName(paths: Iterable<string>): string | null {
  let newest: string | null = null
  for (const path of paths) {
    const name = path.split(/[\\/]/).pop() ?? ''
    if (CHANGELOG_FILE.test(name) && (!newest || name > newest)) newest = name
  }
  return newest
}

/** Settings card for the newest changelog alone. */
export function changelogSectionHtml(release: ChangelogRelease): string {
  return versionSectionHtml(null, release)
}

export type HostedRelease = { version: string | null; release: ChangelogRelease | null }

/** Lazy loaders of raw changelog markdown, keyed by path (the shape `import.meta.glob` returns). */
export type ChangelogLoaders = Record<string, () => Promise<string>>

/** Pick the newest changelog from the build and parse it. Never throws. */
export async function hostedReleaseFrom(appVersion: string | null, loaders: ChangelogLoaders): Promise<HostedRelease> {
  const keys = Object.keys(loaders)
  const name = newestChangelogName(keys)
  const key = name ? keys.find((path) => path.endsWith(`/${name}`)) : undefined
  let release: ChangelogRelease | null = null
  if (name && key) {
    try {
      release = parseChangelog(await loaders[key](), name)
    } catch {
      release = null
    }
  }
  return { version: appVersion || null, release }
}
