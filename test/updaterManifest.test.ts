import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import {
  buildManifest,
  parseUpdatePackageName,
  readUpdatePackages,
  UPDATE_TARGETS,
  updatePackageName,
} from '../scripts/updater-manifest.ts'

const root = resolve(import.meta.dir, '..')
const tauriConfig = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'))
const workflow = readFileSync(join(root, '.github/workflows/desktop.yml'), 'utf8')
const base = 'https://github.com/marco-calderon/visual-living-plan/releases/download/v2.31.0'

test('the app reads latest.json from the newest GitHub release and binds the signed version', () => {
  const updater = tauriConfig.plugins.updater
  assert.deepEqual(updater.endpoints, [
    'https://github.com/marco-calderon/visual-living-plan/releases/latest/download/latest.json',
  ])
  assert.equal(updater.requireSignedVersion, true)
  // The plugin refuses to start without the field. Empty means updates are off in that build.
  assert.equal(typeof updater.pubkey, 'string')
})

test('only the release workflow makes update packages, so a build without the key still works', () => {
  assert.notEqual(tauriConfig.bundle.createUpdaterArtifacts, true)
  assert.match(workflow, /createUpdaterArtifacts":true/)
})

test('every Mac build the workflow makes has an update target', () => {
  for (const triple of workflow.matchAll(/target: ([a-z0-9_]+-apple-darwin)/g)) {
    assert.ok(triple[1] in UPDATE_TARGETS, `${triple[1]} has no update target`)
  }
  assert.deepEqual(
    Object.values(UPDATE_TARGETS).map((target) => target.platform),
    ['darwin-aarch64', 'darwin-x86_64'],
  )
})

test('update package names carry the version and the architecture, as the release shows them', () => {
  assert.equal(
    updatePackageName('Living Plan', '2.31.0', 'aarch64-apple-darwin'),
    'Living.Plan_2.31.0_aarch64.app.tar.gz',
  )
  assert.equal(
    updatePackageName('Living Plan', '2.31.0', 'x86_64-apple-darwin'),
    'Living.Plan_2.31.0_x64.app.tar.gz',
  )
  assert.throws(() => updatePackageName('Living Plan', '2.31.0', 'x86_64-unknown-linux-gnu'))
  assert.deepEqual(parseUpdatePackageName('Living.Plan_2.31.0_x64.app.tar.gz'), {
    version: '2.31.0',
    platform: 'darwin-x86_64',
  })
  assert.deepEqual(parseUpdatePackageName('Living.Plan_3.0.0-beta.1_aarch64.app.tar.gz'), {
    version: '3.0.0-beta.1',
    platform: 'darwin-aarch64',
  })
  assert.equal(parseUpdatePackageName('Living.Plan_2.31.0_aarch64.dmg'), null)
  assert.equal(parseUpdatePackageName('Living.Plan_2.31.0_riscv.app.tar.gz'), null)
})

test('latest.json names both packages with their signatures and download URLs', () => {
  const manifest = buildManifest({
    version: '2.31.0',
    baseUrl: `${base}/`,
    notes: '  Updates itself.\n',
    date: new Date('2026-11-18T12:34:56.789Z'),
    packages: [
      { name: 'Living.Plan_2.31.0_aarch64.app.tar.gz', signature: 'c2lnbmVkIGFybQ==\n' },
      { name: 'Living.Plan_2.31.0_x64.app.tar.gz', signature: 'c2lnbmVkIGludGVs' },
    ],
  })
  assert.deepEqual(manifest, {
    version: '2.31.0',
    notes: 'Updates itself.',
    pub_date: '2026-11-18T12:34:56Z',
    platforms: {
      'darwin-aarch64': {
        signature: 'c2lnbmVkIGFybQ==',
        url: `${base}/Living.Plan_2.31.0_aarch64.app.tar.gz`,
      },
      'darwin-x86_64': {
        signature: 'c2lnbmVkIGludGVs',
        url: `${base}/Living.Plan_2.31.0_x64.app.tar.gz`,
      },
    },
  })
  const withoutNotes = buildManifest({
    version: '2.31.0',
    baseUrl: base,
    notes: '\n',
    packages: [{ name: 'Living.Plan_2.31.0_x64.app.tar.gz', signature: 'c2ln' }],
  })
  assert.equal('notes' in withoutNotes, false)
})

test('latest.json refuses packages of another version, twins, and missing signatures', () => {
  const build = (packages: { name: string; signature: string }[]) =>
    buildManifest({ version: '2.31.0', baseUrl: base, packages })
  assert.throws(() => build([]), /no update packages/)
  assert.throws(() => build([{ name: 'Living.Plan_2.30.1_x64.app.tar.gz', signature: 'c2ln' }]), /version 2.30.1/)
  assert.throws(
    () =>
      build([
        { name: 'Living.Plan_2.31.0_x64.app.tar.gz', signature: 'c2ln' },
        { name: 'Other_2.31.0_x64.app.tar.gz', signature: 'c2ln' },
      ]),
    /two update packages/,
  )
  assert.throws(() => build([{ name: 'Living.Plan_2.31.0_x64.app.tar.gz', signature: ' \n' }]), /empty signature/)
  assert.throws(() => build([{ name: 'Living.Plan.app.tar.gz', signature: 'c2ln' }]), /not an update package/)
})

test('the packages are read with the .sig beside each', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'updater-manifest-'))
  try {
    await writeFile(join(dir, 'Living.Plan_2.31.0_x64.app.tar.gz'), 'x64')
    await writeFile(join(dir, 'Living.Plan_2.31.0_x64.app.tar.gz.sig'), 'c2lnIHg2NA==')
    await writeFile(join(dir, 'Living.Plan_2.31.0_aarch64.app.tar.gz'), 'arm')
    await writeFile(join(dir, 'Living.Plan_2.31.0_aarch64.app.tar.gz.sig'), 'c2lnIGFybQ==')
    await writeFile(join(dir, 'Living.Plan_2.31.0_aarch64.dmg'), 'dmg')
    assert.deepEqual(readUpdatePackages(dir), [
      { name: 'Living.Plan_2.31.0_aarch64.app.tar.gz', signature: 'c2lnIGFybQ==' },
      { name: 'Living.Plan_2.31.0_x64.app.tar.gz', signature: 'c2lnIHg2NA==' },
    ])
    await rm(join(dir, 'Living.Plan_2.31.0_x64.app.tar.gz.sig'))
    assert.throws(() => readUpdatePackages(dir), /has no .*\.sig/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
