import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { choosePlanOpen, pageKey, rememberPageOpened, wasPageOpened } from '../src/openedPages.ts'

const url = 'http://127.0.0.1:9477/plans/abc/'

test('a plan page opens the first time only', async () => {
  const home = mkdtempSync(join(tmpdir(), 'opened-pages-'))
  try {
    const flags = { noOpen: false, forceOpen: false }
    assert.equal(await choosePlanOpen(url, flags, home), 'open')
    await rememberPageOpened(url, home)
    assert.equal(await choosePlanOpen(url, flags, home), 'skip')
    assert.equal(await choosePlanOpen('http://127.0.0.1:9477/plans/other/', flags, home), 'open')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('--open reopens and --no-open never opens', async () => {
  const home = mkdtempSync(join(tmpdir(), 'opened-pages-'))
  try {
    await rememberPageOpened(url, home)
    assert.equal(await choosePlanOpen(url, { noOpen: false, forceOpen: true }, home), 'open')
    assert.equal(await choosePlanOpen('http://127.0.0.1:9477/plans/new/', { noOpen: true, forceOpen: false }, home), 'skip')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('the page key ignores query, hash, and a missing trailing slash', async () => {
  assert.equal(pageKey('http://127.0.0.1:9477/plans/abc?mode=review#x'), url)
  const home = mkdtempSync(join(tmpdir(), 'opened-pages-'))
  try {
    await rememberPageOpened('http://127.0.0.1:9477/plans/abc', home)
    assert.equal(await wasPageOpened(url, home), true)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
