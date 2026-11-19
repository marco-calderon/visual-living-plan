import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from '@playwright/test'
import { buildNoticesScript } from '../scripts/build-desktop.ts'
import { CURRENT_MS, inlineParts, NOTICE_LINKS, releaseCards, updateToast, whatsNewTitle } from '../src/desktopNotices.ts'
import type { WhatsNew } from '../src/releaseNotes.ts'

const NOTES: WhatsNew = {
  version: '2.32.1',
  omitted: 2,
  releases: [
    { version: '2.32.1', date: '2026-11-20', summary: 'A fix.', features: [], improvements: [], bugs: ['The `notice` stayed.'], changes: [] },
    {
      version: '2.32.0',
      date: '2026-11-19',
      summary: 'Updates show **in the window**.',
      features: ['A persistent notice.', "What's new, *once* per minor."],
      improvements: ['Restart from the [notice](https://example.com).'],
      bugs: [],
      changes: [],
    },
  ],
}

test('each update step has its own toast', () => {
  assert.deepEqual(updateToast({ stage: 'checking' }), { type: 'loading', title: 'Checking for updates…', duration: 0 })

  const downloading = updateToast({ stage: 'downloading', version: '2.32.0', received: 5 * 1024 * 1024, total: 20 * 1024 * 1024 })
  assert.equal(downloading.title, 'Downloading Living Plan 2.32.0')
  assert.equal(downloading.description, '5.0 MB of 20 MB · 25%')
  assert.equal(downloading.progress, 0.25)
  assert.equal(downloading.duration, 0)
  assert.deepEqual(downloading.secondary, { label: 'Hide', href: NOTICE_LINKS.hide })
  // A server that does not say the size: no bar, the bytes so far.
  const unsized = updateToast({ stage: 'downloading', version: '2.32.0', received: 2048, total: null })
  assert.equal(unsized.progress, undefined)
  assert.equal(unsized.description, '2.0 KB so far')
  assert.equal(updateToast({ stage: 'downloading', version: '2.32.0', received: 0, total: null }).description, 'Starting the download…')

  assert.equal(updateToast({ stage: 'installing', version: '2.32.0' }).progress, 1)

  const ready = updateToast({ stage: 'ready', version: '2.32.0' })
  assert.equal(ready.title, 'Living Plan 2.32.0 is ready')
  assert.equal(ready.duration, 0)
  assert.deepEqual([ready.action?.label, ready.action?.href], ['Restart now', NOTICE_LINKS.restart])
  assert.deepEqual([ready.secondary?.label, ready.secondary?.href], ['Later', NOTICE_LINKS.later])

  assert.deepEqual(updateToast({ stage: 'current', version: '2.32.0' }), {
    type: 'success',
    title: 'Living Plan 2.32.0 is up to date',
    duration: CURRENT_MS,
  })
  const failed = updateToast({ stage: 'failed', message: 'Offline.', retry: true })
  assert.deepEqual([failed.type, failed.description, failed.duration, failed.action?.href], ['error', 'Offline.', 0, NOTICE_LINKS.check])
  assert.equal(updateToast({ stage: 'failed', message: 'Bad signature.', retry: false }).action, undefined)
})

test('changelog text keeps code, bold, and emphasis, and a link keeps its words', () => {
  assert.deepEqual(inlineParts('Run `live-plan serve`, **now**, *then* see [the docs](https://example.com).'), [
    { kind: 'text', text: 'Run ' },
    { kind: 'code', text: 'live-plan serve' },
    { kind: 'text', text: ', ' },
    { kind: 'strong', text: 'now' },
    { kind: 'text', text: ', ' },
    { kind: 'em', text: 'then' },
    { kind: 'text', text: ' see the docs.' },
  ])
  assert.deepEqual(inlineParts('2 * 3 = 6 <b>'), [{ kind: 'text', text: '2 * 3 = 6 <b>' }])
})

test('the notes lead with new features and leave out empty headings', () => {
  assert.deepEqual(
    releaseCards(NOTES.releases[1]!).map((card) => [card.label, card.items.length]),
    [
      ['New features', 2],
      ['Improvements', 1],
    ],
  )
  assert.equal(whatsNewTitle(NOTES), "What's new in Living Plan 2.32")
})

let browser: Browser
let script: string

before(async () => {
  script = await buildNoticesScript()
  browser = await chromium.launch({ args: ['--no-sandbox'] })
})

after(async () => {
  await browser?.close()
})

/** A page as the app shows it: the notices script runs first, and app links are recorded instead of followed. */
async function appPage(body = '<header class="titlebar">Plans</header><main>Plan</main>'): Promise<{ page: Page; links: string[] }> {
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } })
  const links: string[] = []
  await page.exposeFunction('__followed', (href: string) => links.push(href))
  await page.addInitScript(script)
  await page.addInitScript(() => {
    window.addEventListener(
      'click',
      (event) => {
        const target = event.composedPath()[0]
        if (target instanceof HTMLAnchorElement && target.href.startsWith('living-plan:')) {
          event.preventDefault()
          ;(window as unknown as { __followed: (href: string) => void }).__followed(target.href)
        }
      },
      true,
    )
  })
  await page.route('**/*', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><body>${body}</body></html>` }))
  await page.goto('http://127.0.0.1:9477/dashboard')
  return { page, links }
}

function push(page: Page, notice: unknown) {
  return page.evaluate((value) => (window as never as { __LIVING_PLAN_NOTICES__: { update(v: unknown): void } }).__LIVING_PLAN_NOTICES__.update(value), notice)
}

function showNotes(page: Page, notes: unknown) {
  return page.evaluate((value) => (window as never as { __LIVING_PLAN_NOTICES__: { whatsNew(v: unknown): void } }).__LIVING_PLAN_NOTICES__.whatsNew(value), notes)
}

const notices = (page: Page) => page.locator('living-plan-notices')

/** Wait until no toast is left, including one still animating out. */
function noToasts(page: Page) {
  return page.waitForFunction(() => !document.querySelector('living-plan-notices')?.shadowRoot?.querySelector('.tst-slot'))
}

test('the update notice shows progress, then restarts the app from its button', async () => {
  const { page, links } = await appPage()
  try {
    // Nothing is drawn until the app has something to show.
    assert.equal(await notices(page).count(), 0)
    await push(page, { stage: 'downloading', version: '2.32.0', received: 1024 * 1024, total: 4 * 1024 * 1024 })
    const toast = notices(page).locator('.tst')
    await toast.locator('.tst-title', { hasText: 'Downloading Living Plan 2.32.0' }).waitFor()
    assert.equal(await toast.locator('.tst-progress').evaluate((bar) => getComputedStyle(bar).getPropertyValue('--pg').trim()), '0.25')

    await push(page, { stage: 'downloading', version: '2.32.0', received: 3 * 1024 * 1024, total: 4 * 1024 * 1024 })
    await toast.locator('.tst-desc', { hasText: '75%' }).waitFor()
    // One notice, updated in place.
    assert.equal(await notices(page).locator('.tst-slot').count(), 1)

    await push(page, { stage: 'ready', version: '2.32.0' })
    await toast.getByRole('button', { name: 'Restart now' }).click()
    assert.deepEqual(links, [NOTICE_LINKS.restart])
    await toast.locator('.tst-title', { hasText: 'Restarting…' }).waitFor()
  } finally {
    await page.close()
  }
})

test('Hide keeps a step away until the next one, and the page cannot dismiss the notice', async () => {
  const { page, links } = await appPage()
  try {
    await push(page, { stage: 'downloading', version: '2.32.0', received: 0, total: 100 })
    const toast = notices(page).locator('.tst')
    await toast.getByRole('button', { name: 'Hide' }).click()
    assert.deepEqual(links, [NOTICE_LINKS.hide])
    await noToasts(page)
    // Progress that was already on its way does not bring it back.
    await push(page, { stage: 'downloading', version: '2.32.0', received: 50, total: 100 })
    await page.waitForTimeout(400)
    assert.equal(await notices(page).locator('.tst-slot').count(), 0)

    await push(page, { stage: 'ready', version: '2.32.0' })
    await toast.locator('.tst-title', { hasText: 'is ready' }).waitFor()
    // Escape belongs to the page.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    assert.equal(await toast.locator('.tst-title', { hasText: 'is ready' }).count(), 1)
    await toast.getByRole('button', { name: 'Later' }).click()
    assert.deepEqual(links, [NOTICE_LINKS.hide, NOTICE_LINKS.later])

    // The app takes a notice away with null.
    await push(page, { stage: 'current', version: '2.32.0' })
    await toast.locator('.tst-title', { hasText: 'up to date' }).waitFor()
    await push(page, null)
    await noToasts(page)
  } finally {
    await page.close()
  }
})

test('What\'s new opens as the Settings modal and reports when it is closed', async () => {
  // The page's own rules for the same class names do not reach the notes.
  const { page, links } = await appPage('<style>.settings-dialog{display:none!important}.release-card{color:red}</style><header class="titlebar"></header>')
  try {
    await showNotes(page, NOTES)
    const dialog = notices(page).getByRole('dialog')
    await dialog.waitFor()
    assert.equal(await dialog.locator('.settings-dialog-title').textContent(), "What's new in Living Plan 2.32")
    assert.equal(await dialog.locator('.settings-dialog.whats-new').isVisible(), true)
    assert.deepEqual(await dialog.locator('.whats-new-version').allTextContents(), ['2.32.1', '2.32.0'])
    assert.deepEqual(await dialog.locator('[data-version="2.32.0"] .release-card .settings-kicker').allTextContents(), ['New features', 'Improvements'])
    assert.equal(await dialog.locator('[data-version="2.32.0"] .settings-copy strong').textContent(), 'in the window')
    assert.equal(await dialog.locator('.release-list code').first().textContent(), 'notice')
    assert.match((await dialog.locator('.whats-new-body > .settings-meta').textContent()) ?? '', /2 earlier releases/)
    // The same notes again do not open a second modal.
    await showNotes(page, NOTES)
    assert.equal(await notices(page).getByRole('dialog').count(), 1)

    await dialog.getByRole('button', { name: 'Continue' }).click()
    assert.deepEqual(links, [NOTICE_LINKS.notesSeen])
    await notices(page).locator('dialog').waitFor({ state: 'detached' })

    // Escape closes it too, and counts as seen.
    await showNotes(page, { ...NOTES, version: '2.33.0' })
    await notices(page).getByRole('dialog').waitFor()
    await page.keyboard.press('Escape')
    await notices(page).locator('dialog').waitFor({ state: 'detached' })
    assert.deepEqual(links, [NOTICE_LINKS.notesSeen, NOTICE_LINKS.notesSeen])
  } finally {
    await page.close()
  }
})

test('a page script cannot replace the notices', async () => {
  const { page } = await appPage()
  try {
    const replaced = await page.evaluate(() => {
      const win = window as never as { __LIVING_PLAN_NOTICES__: unknown }
      const original = win.__LIVING_PLAN_NOTICES__
      try {
        win.__LIVING_PLAN_NOTICES__ = { update() {}, whatsNew() {} }
      } catch {
        // Strict mode throws; either way it stays.
      }
      return win.__LIVING_PLAN_NOTICES__ !== original
    })
    assert.equal(replaced, false)
  } finally {
    await page.close()
  }
})
