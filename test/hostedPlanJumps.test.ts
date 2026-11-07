import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from '@playwright/test'

// The hosted page binds its tabs and plan links with src/bindPlanChrome.ts, not the local page's inline script.
const PAGE = `<!doctype html><html><body>
<nav><button data-tab-target="plan" aria-selected="true">Plan</button><button data-tab-target="workflow" aria-selected="false">Workflow</button></nav>
<main data-tab-panel="plan">
  <section id="plan-design" data-plan-ref="design" style="height:900px"><a href="#workflow/design" data-workflow-jump="design">1</a> Design</section>
  <section id="plan-rollout" data-plan-ref="rollout" style="height:900px">Rollout</section>
  <p><a id="bare" href="rollout">see rollout</a></p>
</main>
<div data-tab-panel="workflow" hidden><a id="node" href="#plan-rollout" data-plan-jump="rollout">Rollout step</a></div>
</body></html>`

let browser: Browser
let page: Page
let script = ''

before(async () => {
  const built = await Bun.build({
    entrypoints: [new URL('../src/bindPlanChrome.ts', import.meta.url).pathname],
    format: 'esm',
    target: 'browser',
    write: false,
  })
  script = (await built.outputs[0]?.text()) ?? ''
  browser = await chromium.launch({ args: ['--no-sandbox'] })
})

after(async () => {
  await browser?.close()
})

async function open(): Promise<Page> {
  page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  await page.route('https://plan.test/**', (route) => route.fulfill({ contentType: 'text/html', body: PAGE }))
  await page.goto('https://plan.test/plans/demo/')
  await page.evaluate(async (code) => {
    const mod = (await import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })))) as { bindPlanChrome: () => void }
    const focused: string[] = []
    window.addEventListener('living-plan-focus-workflow', (event) => focused.push((event as CustomEvent<{ ref: string }>).detail.ref))
    Object.assign(window, { __focused: focused })
    mod.bindPlanChrome()
  }, script)
  return page
}

const tab = () => page.evaluate(() => document.querySelector('[data-tab-target][aria-selected="true"]')?.getAttribute('data-tab-target'))

test('a step number on the plan opens that workflow step, and Back returns to the plan', async () => {
  await open()
  await page.click('[data-workflow-jump="design"]')
  assert.equal(await tab(), 'workflow')
  assert.equal(await page.evaluate(() => location.hash), '#workflow/design')
  assert.deepEqual(await page.evaluate(() => (window as unknown as { __focused: string[] }).__focused), ['design'])
  await page.goBack()
  await page.waitForFunction(() => document.querySelector('[data-tab-target="plan"]')?.getAttribute('aria-selected') === 'true')
  assert.equal(await tab(), 'plan')
  await page.close()
})

test('a workflow step opens its plan section and marks it, and Back returns to the workflow', async () => {
  await open()
  await page.click('[data-tab-target="workflow"]')
  await page.click('#node')
  assert.equal(await tab(), 'plan')
  assert.equal(await page.evaluate(() => location.hash), '#plan-rollout')
  assert.equal(await page.evaluate(() => document.querySelector('.plan-ref-focus')?.id), 'plan-rollout')
  await page.goBack()
  await page.waitForFunction(() => document.querySelector('[data-tab-target="workflow"]')?.getAttribute('aria-selected') === 'true')
  await page.close()
})

test('a bare section link stays on the page, and the canvas can ask the plan to show a section', async () => {
  await open()
  await page.click('#bare')
  assert.equal(page.url(), 'https://plan.test/plans/demo/#plan-rollout')
  assert.equal(await page.evaluate(() => document.querySelector('.plan-ref-focus')?.id), 'plan-rollout')
  await page.evaluate(() => (window as unknown as { livingPlanFocusPlanRef: (ref: string) => void }).livingPlanFocusPlanRef('design'))
  assert.equal(await page.evaluate(() => document.querySelector('.plan-ref-focus')?.id), 'plan-design')
  await page.close()
})
