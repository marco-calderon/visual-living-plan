import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  changelogSectionHtml,
  loadLatestChangelog,
  parseChangelog,
} from '../src/changelog.ts'
import { createIdleExecutionState } from '../src/execution.ts'
import { parsePlan } from '../src/parse.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'

const classified = `# Changelog — 2026-10-27

## 0.2.2

**Bump:** patch

### Summary

Install path.

### Improvements

- Add the \`version-bump\` skill.
- Point root \`AGENTS.md\` at that skill.

## 0.3.0

**Bump:** minor

### New features

- Layered left-to-right placement.

## 0.4.0

### Summary

The fixed header is gone.

### New features

- Click the logo to open a card.
`

test('kind headings become three cards and ignore the summary', () => {
  const release = parseChangelog(classified, 'changelog-2026-10-27.md')
  assert.ok(release)
  assert.equal(release.classified, true)
  assert.deepEqual(release.versions, ['0.2.2', '0.3.0', '0.4.0'])
  assert.deepEqual(release.bugs, [])
  assert.equal(release.improvements.length, 2)
  assert.equal(release.improvements[0].version, '0.2.2')
  assert.match(release.improvements[0].text, /version-bump/)
  assert.equal(release.features.length, 2)
  assert.equal(release.features[1].version, '0.4.0')
  assert.deepEqual(release.changes, [])

  const html = changelogSectionHtml(release)
  assert.match(html, /data-kind="bugs"[^>]*data-empty="true"/)
  assert.match(html, /Bugs fixed/)
  assert.match(html, /class="release-count">0</)
  assert.match(html, /None in this file\./)
  assert.match(html, /data-kind="improvements"/)
  assert.match(html, /class="release-count">2</)
  assert.match(html, /data-kind="features"/)
  assert.match(html, /<code>version-bump<\/code>/)
  assert.match(html, /from 0\.2\.2 through 0\.4\.0/)
  assert.doesNotMatch(html, /data-kind="changes"/)
  assert.doesNotMatch(html, /The fixed header is gone/)
  assert.doesNotMatch(html, /<script>/)
})

test('a flat Changes list stays one card', () => {
  const release = parseChangelog(
    `## 0.1.0

### Changes

- First change
- Second <script>alert(1)</script>
`,
    'changelog-2026-01-01.md',
  )
  assert.ok(release)
  assert.equal(release.classified, false)
  assert.equal(release.changes.length, 2)
  const html = changelogSectionHtml(release)
  assert.match(html, /data-kind="changes"/)
  assert.match(html, /Shipped in <code>changelog-2026-01-01\.md<\/code>, 0\.1\.0\./)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /data-kind="bugs"/)
})

test('kind headings and a leftover Changes list both show', () => {
  const release = parseChangelog(
    `## 0.2.0

### Changes

- Older bullet

## 0.3.0

### Bugs fixed

- The grid jumped.
`,
    'changelog-2026-02-02.md',
  )
  assert.ok(release)
  assert.equal(release.classified, true)
  assert.equal(release.bugs.length, 1)
  assert.equal(release.changes.length, 1)
  const html = changelogSectionHtml(release)
  assert.match(html, /data-kind="bugs"/)
  assert.match(html, /data-kind="changes"/)
  assert.match(html, /Older bullet/)
})

test('a changelog with no bullets is hidden', () => {
  assert.equal(parseChangelog('## 0.1.0\n\n### Summary\n\nHello.\n', 'changelog-2026-01-01.md'), null)
})

test('the newest dated file wins, and a missing directory is empty', () => {
  const root = mkdtempSync(join(tmpdir(), 'changelog-'))
  try {
    const dir = join(root, 'docs', 'changelogs')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'notes.md'), '## 9.9.9\n\n### New features\n\n- Ignore me\n')
    writeFileSync(join(dir, 'changelog-2026-01-02.md'), '## 0.1.0\n\n### Improvements\n\n- Older\n')
    writeFileSync(join(dir, 'changelog-2026-10-27.md'), '## 0.5.0\n\n### New features\n\n- Newest\n')
    const release = loadLatestChangelog(join(root, 'src', 'cli.ts'))
    assert.ok(release)
    assert.equal(release.fileName, 'changelog-2026-10-27.md')
    assert.equal(release.features[0].text, 'Newest')
    assert.equal(loadLatestChangelog(join(root, 'empty-pkg', 'src', 'cli.ts')), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the repo changelog is classified and Settings renders it above Appearance', () => {
  const release = loadLatestChangelog(fileURLToPath(new URL('../src/cli.ts', import.meta.url)))
  assert.ok(release)
  assert.equal(release.fileName, 'changelog-2026-10-30.md')
  assert.equal(release.classified, true)
  assert.equal(release.bugs.length, 4)
  assert.equal(release.features.length, 10)
  assert.equal(release.versions[0], '1.5.11')
  assert.equal(release.versions.at(-1), '1.6.9')
  assert.ok(release.improvements.some((line) => line.version === '1.5.11' && line.text.includes('18px square')))
  assert.ok(release.improvements.some((line) => line.version === '1.5.12' && line.text.includes('skills:install')))
  assert.ok(release.improvements.some((line) => line.version === '1.5.13' && line.text.includes('Plans button')))
  assert.ok(release.bugs.some((line) => line.version === '1.5.14' && line.text.includes('settings tab')))
  assert.ok(release.improvements.some((line) => line.version === '1.5.14' && line.text.includes('history step')))
  assert.ok(release.features.some((line) => line.version === '1.5.15' && line.text.includes('40%')))
  assert.ok(release.features.some((line) => line.version === '1.6.0' && line.text.includes('serve --cloud')))
  assert.ok(release.bugs.some((line) => line.version === '1.6.2' && line.text.includes('signed in')))
  assert.ok(release.bugs.some((line) => line.version === '1.6.3' && line.text.includes('row count')))
  assert.ok(release.features.some((line) => line.version === '1.6.3' && line.text.includes('Column search')))
  assert.ok(release.improvements.some((line) => line.version === '1.6.5' && line.text.includes('account login')))
  assert.ok(release.features.some((line) => line.version === '1.6.6' && line.text.includes('appearance settings')))
  assert.ok(release.features.some((line) => line.version === '1.6.8' && line.text.includes('markdown table cell')))
  assert.ok(release.features.some((line) => line.version === '1.6.9' && line.text.includes('plans dashboard')))
  assert.ok(release.features.some((line) => line.version === '1.6.9' && line.text.includes('latest 10 versions')))
  assert.ok(release.bugs.some((line) => line.version === '1.6.9' && line.text.includes('Sign in required')))

  const plan = parsePlan('---\ntitle: Sample\n---\n\n# Scope\n\nKeep it.\n', 'sample.plan.md')
  const html = renderPlanPage({
    plan,
    mode: 'watch',
    responses: {},
    diffs: [],
    iteration: 1,
    pendingInteractionIds: [],
    execution: createIdleExecutionState(),
    clientAssets: null,
    theme: themePayload(defaultThemeConfig(), 'live-plan.config.json'),
    changelog: release,
  })
  const releaseAt = html.indexOf('data-changelog')
  const appearanceAt = html.indexOf('Accent color')
  assert.ok(releaseAt >= 0 && appearanceAt > releaseAt)
  assert.match(html, /data-kind="features"/)
  assert.match(html, /data-kind="bugs"/)
  assert.match(html, /data-kind="improvements"/)
  assert.match(html, /18px square/)
  assert.match(html, /40% of the table/)
})
