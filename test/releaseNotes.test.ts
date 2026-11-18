import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { loadVersionNotes } from '../src/changelog.ts'
import { parseVersionNotes, type VersionNotes } from '../src/changelogParse.ts'
import { dueWhatsNew } from '../src/desktopCommand.ts'
import { defaultDesktopConfig, mergeDesktopConfig, parseDesktopConfig } from '../src/desktopConfig.ts'
import { isNewerMinor, notesDue, whatsNew, WHATS_NEW_RELEASES } from '../src/releaseNotes.ts'

const root = resolve(import.meta.dir, '..')

const FILE = `# Changelog — 2026-11-20

## 2.33.1

**PR:** #210

**Bump:** patch

### Summary

The notes fix.
A second line of the summary.

Not part of the summary.

### Bugs fixed

- The What's new list
  wrapped badly.

### Notes

No registry restart needed.

## 2.33.0

**Bump:** minor

### Summary

Updates show in the window.

### New features

- A persistent \`update\` notice with progress.
- What's new after a minor release.

### Improvements

- Restart from the notice.

## not a version

- skipped
`

function notes(version: string, extra: Partial<VersionNotes> = {}): VersionNotes {
  return { version, date: null, summary: `About ${version}.`, features: [], improvements: [], bugs: [], changes: [], ...extra }
}

test('each version section of a changelog becomes its own notes', () => {
  const parsed = parseVersionNotes(FILE, 'changelog-2026-11-20.md')
  assert.deepEqual(
    parsed.map((entry) => entry.version),
    ['2.33.1', '2.33.0'],
  )
  const [patch, minor] = parsed
  assert.equal(patch?.date, '2026-11-20')
  assert.equal(patch?.summary, 'The notes fix. A second line of the summary.')
  assert.deepEqual(patch?.bugs, ["The What's new list wrapped badly."])
  assert.deepEqual([patch?.features, patch?.improvements], [[], []])
  assert.equal(minor?.summary, 'Updates show in the window.')
  assert.deepEqual(minor?.features, ['A persistent `update` notice with progress.', "What's new after a minor release."])
  assert.deepEqual(minor?.improvements, ['Restart from the notice.'])
})

test('notes are due for a newer minor or major, never for a patch or an older version', () => {
  assert.equal(isNewerMinor('2.33.0', '2.32.9'), true)
  assert.equal(isNewerMinor('3.0.0', '2.40.1'), true)
  assert.equal(isNewerMinor('2.33.4', '2.33.0'), false)
  assert.equal(isNewerMinor('2.32.0', '2.33.0'), false)
  assert.equal(notesDue('2.33.0', null), true)
  assert.equal(notesDue('2.33.2', '2.33.0'), false)
  assert.equal(notesDue('not a version', null), false)
})

test('What\'s new lists every release after the one seen, newest first', () => {
  const releases = [notes('2.31.1'), notes('2.32.0'), notes('2.33.0'), notes('2.33.1'), notes('2.34.0'), notes('2.32.1')]
  const shown = whatsNew('2.33.1', '2.31.1', releases)
  assert.deepEqual(
    shown?.releases.map((entry) => entry.version),
    ['2.33.1', '2.33.0', '2.32.1', '2.32.0'],
  )
  assert.equal(shown?.version, '2.33.1')
  assert.equal(shown?.omitted, 0)
  // A patch on a minor already seen shows nothing.
  assert.equal(whatsNew('2.33.1', '2.33.0', releases), null)
  // A newer release in the files than the app is left out.
  assert.equal(whatsNew('2.33.1', '2.31.1', releases)?.releases.some((entry) => entry.version === '2.34.0'), false)
})

test('without a record, the notes start at this minor', () => {
  const releases = [notes('2.32.1'), notes('2.33.0'), notes('2.33.2')]
  assert.deepEqual(
    whatsNew('2.33.2', null, releases)?.releases.map((entry) => entry.version),
    ['2.33.2', '2.33.0'],
  )
})

test('releases without notes are skipped, and nothing to show is null', () => {
  const empty = notes('2.33.0', { summary: '' })
  assert.equal(whatsNew('2.33.0', '2.32.0', [empty]), null)
  assert.equal(whatsNew('2.33.0', '2.32.0', []), null)
  // The first copy of a version wins: files are read newest first.
  const twice = whatsNew('2.33.0', '2.32.0', [notes('2.33.0', { summary: 'Newest file.' }), notes('2.33.0', { summary: 'Older file.' })])
  assert.deepEqual(twice?.releases.map((entry) => entry.summary), ['Newest file.'])
})

test('a long gap keeps the newest releases and counts the rest', () => {
  const releases = Array.from({ length: WHATS_NEW_RELEASES + 3 }, (_, index) => notes(`2.${20 + index}.0`))
  const shown = whatsNew(`2.${20 + WHATS_NEW_RELEASES + 2}.0`, '2.19.0', releases)
  assert.equal(shown?.releases.length, WHATS_NEW_RELEASES)
  assert.equal(shown?.releases[0]?.version, `2.${20 + WHATS_NEW_RELEASES + 2}.0`)
  assert.equal(shown?.omitted, 3)
})

test('the changelog directory reads newest file first, and the shipped files parse', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'live-plan-notes-'))
  try {
    await writeFile(join(dir, 'changelog-2026-11-19.md'), '# Changelog\n\n## 2.32.0\n\n### Summary\n\nOlder.\n')
    await writeFile(join(dir, 'changelog-2026-11-20.md'), FILE)
    await writeFile(join(dir, 'README.md'), '## 9.9.9\n\n### Summary\n\nNot a changelog.\n')
    assert.deepEqual(
      loadVersionNotes(dir).map((entry) => entry.version),
      ['2.33.1', '2.33.0', '2.32.0'],
    )
    assert.deepEqual(loadVersionNotes(join(dir, 'missing')), [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  const shipped = loadVersionNotes(join(root, 'docs', 'changelogs'))
  assert.ok(shipped.length > 10)
  for (const entry of shipped) assert.match(entry.version, /^\d+\.\d+\.\d+$/)
  // Every release this repo ships has a summary for What's new to lead with.
  const pkg = (await import('../package.json')).default as { version: string }
  const current = shipped.find((entry) => entry.version === pkg.version)
  assert.ok(current?.summary, `docs/changelogs has a ### Summary for ${pkg.version}`)
})

test('the config records the notes seen, and a first setup starts the record', () => {
  assert.equal(parseDesktopConfig({ notesSeen: '2.32.0' }).notesSeen, '2.32.0')
  assert.equal(parseDesktopConfig({ notesSeen: 'latest' }).notesSeen, null)
  const start = defaultDesktopConfig()
  assert.equal(mergeDesktopConfig(start, { notesSeen: '2.33.0' }).notesSeen, '2.33.0')
  assert.equal(mergeDesktopConfig({ ...start, notesSeen: '2.33.0' }, { notesSeen: null }).notesSeen, null)
  assert.throws(() => mergeDesktopConfig(start, { notesSeen: '2.33' }), /notesSeen/)
  // Finishing setup the first time: nothing to catch up on.
  assert.equal(mergeDesktopConfig(start, { setupDone: true }, { version: '2.33.0' }).notesSeen, '2.33.0')
  // Setup again later leaves the record alone.
  const done = { ...start, setupDone: true, notesSeen: null }
  assert.equal(mergeDesktopConfig(done, { setupDone: true }, { version: '2.33.0' }).notesSeen, null)
})

test('desktop state offers What\'s new only after setup and past the minor seen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'live-plan-notes-'))
  try {
    await writeFile(join(dir, 'changelog-2026-11-20.md'), FILE)
    const context = { version: '2.33.1', changelogs: dir }
    const done = { ...defaultDesktopConfig(), setupDone: true }
    assert.equal(dueWhatsNew(defaultDesktopConfig(), context), null)
    assert.deepEqual(
      dueWhatsNew({ ...done, notesSeen: '2.32.4' }, context)?.releases.map((entry) => entry.version),
      ['2.33.1', '2.33.0'],
    )
    assert.equal(dueWhatsNew({ ...done, notesSeen: '2.33.0' }, context), null)
    assert.equal(dueWhatsNew(done, { version: '2.33.1' }), null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
