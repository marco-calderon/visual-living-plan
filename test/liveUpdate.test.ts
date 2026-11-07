import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from '@playwright/test'

let browser: Browser
let page: Page

before(async () => {
  const [live, parts] = await Promise.all([
    bundle(new URL('../client/liveUpdate.ts', import.meta.url).pathname),
    bundle(new URL('../client/planParts.ts', import.meta.url).pathname),
  ])
  browser = await chromium.launch({ args: ['--no-sandbox'] })
  page = await browser.newPage({ viewport: { width: 400, height: 600 } })
  await page.goto('about:blank')
  await page.evaluate(
    async ({ liveCode, partsCode }) => {
      const load = (code: string) => import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })))
      Object.assign(window, { __live: await load(liveCode), __parts: await load(partsCode) })
    },
    { liveCode: live, partsCode: parts },
  )
})

after(async () => {
  await browser?.close()
})

test('a comment excerpt keeps a space between a callout label and its body', async () => {
  const text = await page.evaluate(() => {
    document.body.innerHTML = `<aside id="c"><div class="plan-callout-label"><span>note</span> · <span>Next: a comment</span></div><p>You picked <strong>A comment</strong>.</p></aside>`
    const parts = (window as unknown as { __parts: { readableText: (element: Element) => string } }).__parts
    return parts.readableText(document.getElementById('c')!)
  })
  assert.equal(text, 'note · Next: a comment You picked A comment.')
})

test('the reader keeps their place when content above them grows', async () => {
  const result = await page.evaluate(() => {
    document.body.innerHTML = `<div id="root"><article data-plan-rendered>${Array.from({ length: 12 }, (_, i) => `<section style="height:300px">Block ${i}</section>`).join('')}</article></div>`
    window.scrollTo(0, 1500)
    const live = (window as unknown as { __live: typeof import('../client/liveUpdate.ts') }).__live
    const root = document.getElementById('root')!
    const anchor = live.scrollAnchor(root)
    const before = anchor?.element.getBoundingClientRect().top
    // A new block lands above the reader.
    const first = root.querySelector('section')!
    const added = document.createElement('section')
    added.style.height = '420px'
    first.before(added)
    live.restoreScrollAnchor(anchor)
    return { text: anchor?.element.textContent, before, after: anchor?.element.getBoundingClientRect().top, scrollY: window.scrollY }
  })
  assert.match(result.text ?? '', /^Block \d+$/)
  assert.equal(result.after, result.before)
  assert.equal(result.scrollY, 1920)
})

test('only the block whose content changed is flashed, and a nested change marks the inner block', async () => {
  const flashed = await page.evaluate(() => {
    const live = (window as unknown as { __live: typeof import('../client/liveUpdate.ts') }).__live
    document.body.innerHTML = `<div id="root"><article data-plan-rendered>
      <h2 data-plan-part="markdown:0/heading:1">Intro</h2>
      <section data-entry="phase" data-plan-part="phase:a" data-status="done">A</section>
      <section data-entry="phase" data-plan-part="phase:b" data-status="pending">B<div class="code-host" data-source="echo 1"><span>1</span>echo 1</div></section>
      <div data-plan-part="stack"><section data-entry="callout" data-plan-part="callout:c">Note</section></div>
    </article></div>`
    const root = document.getElementById('root')!
    const before = live.readBlockSignatures(root)
    root.querySelector<HTMLElement>('[data-plan-part="phase:b"]')!.dataset.status = 'active'
    // Drawn code differs, its source does not: not a change.
    root.querySelector('.code-host span')!.textContent = '01'
    root.querySelector('[data-plan-part="callout:c"]')!.textContent = 'Note, edited'
    return live.markChangedBlocks(root, before, live.readBlockSignatures(root)).map((element) => element.dataset.planPart)
  })
  assert.deepEqual(flashed, ['phase:b', 'callout:c'])
})

async function bundle(entry: string): Promise<string> {
  const built = await Bun.build({ entrypoints: [entry], format: 'esm', target: 'browser', write: false })
  const output = built.outputs[0]
  if (!output) throw new Error(`Could not bundle ${entry}`)
  return output.text()
}
