import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterSections, formatBytes, groupSections, rootSearch, settingsSectionId } from '../src/settings/settingsSections.ts'

test('only a known section opens the settings modal', () => {
  assert.equal(settingsSectionId('usage'), 'usage')
  assert.equal(settingsSectionId('billing'), undefined)
  assert.equal(settingsSectionId(1), undefined)
  assert.deepEqual(rootSearch({ settings: 'account', settingsError: 'email_doesnt_match' }), {
    settings: 'account',
    settingsError: 'email_doesnt_match',
  })
  assert.deepEqual(rootSearch({ settings: 'account', settingsError: '<script>' }), { settings: 'account' })
  // An error without an open section is dropped, so it never shows later.
  assert.deepEqual(rootSearch({ settingsError: 'access_denied' }), {})
})

test('search matches section labels and keywords', () => {
  assert.deepEqual(
    filterSections('').map((section) => section.id),
    ['general', 'account', 'usage', 'about'],
  )
  assert.deepEqual(filterSections('storage').map((section) => section.id), ['usage'])
  assert.deepEqual(filterSections('GitHub').map((section) => section.id), ['account'])
  assert.deepEqual(filterSections('code wrap').map((section) => section.id), ['general'])
  assert.deepEqual(filterSections('nothing here'), [])
  assert.deepEqual(
    groupSections(filterSections('')).map((group) => [group.group, group.sections.length]),
    [
      ['Preferences', 3],
      ['Host', 1],
    ],
  )
})

test('bytes read as B, KB, and MB', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(1023), '1023 B')
  assert.equal(formatBytes(1024), '1.0 KB')
  assert.equal(formatBytes(93_155), '91 KB')
  assert.equal(formatBytes(5 * 1024 * 1024 + 300_000), '5.3 MB')
})
