import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from '@playwright/test'
import { stampPlanParts } from '../client/stampPlanParts.ts'
import { dataTableCellPartId, dataTableCellToken, markdownCellPartId } from '../src/planMdx/cellPart.ts'
import { parsePlan } from '../src/parse.ts'

const partIdPattern = /^[A-Za-z0-9_.:/-]{1,200}$/

let browser: Browser
let page: Page
let stampSource = ''
let partsSource = ''

before(async () => {
  const [stamp, parts] = await Promise.all([
    bundle(new URL('../client/stampPlanParts.ts', import.meta.url).pathname),
    bundle(new URL('../client/planParts.ts', import.meta.url).pathname),
  ])
  stampSource = stamp
  partsSource = parts
  browser = await chromium.launch({ args: ['--no-sandbox'] })
  page = await browser.newPage()
  await page.goto('about:blank')
  await page.evaluate(
    async ({ stampCode, partsCode }) => {
      const load = (code: string) => import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })))
      const stampMod = (await load(stampCode)) as { stampPlanParts: (root: ParentNode) => void }
      const partsMod = (await load(partsCode)) as {
        resolvePart: (start: Element | null) => HTMLElement | null
      }
      Object.assign(window, {
        __stampPlanParts: stampMod.stampPlanParts,
        __resolvePart: partsMod.resolvePart,
      })
    },
    { stampCode: stampSource, partsCode: partsSource },
  )
})

after(async () => {
  await browser?.close()
})

test('markdown cell ids stay in document order across two tables', () => {
  const plan = parsePlan(`# Demo

Before.

| A | B |
| --- | --- |
| 1 | 2 |

After.

| C |
| --- |
| 3 |
`)
  const markdown = plan.blocks.find((block) => block.type === 'markdown')
  assert.ok(markdown && markdown.type === 'markdown')
  assert.deepEqual(cellIds(markdown.html), [
    markdownCellPartId('markdown:0', 1),
    markdownCellPartId('markdown:0', 2),
    markdownCellPartId('markdown:0', 3),
    markdownCellPartId('markdown:0', 4),
    markdownCellPartId('markdown:0', 5),
    markdownCellPartId('markdown:0', 6),
  ])
  assert.match(markdown.html, /data-plan-part="markdown:0\/paragraph:1"/)
  assert.match(markdown.html, /data-plan-part="markdown:0\/paragraph:2"/)
  assert.match(markdown.html, /data-plan-part="markdown:0\/heading:1"/)
  for (const id of cellIds(markdown.html)) assert.match(id, partIdPattern)
})

test('stamped markdown cells match the static comment targets', async () => {
  const plan = parsePlan(`# Demo

Before.

| Name | Count |
| --- | ---: |
| Ada | 3 |

- Still a list

After.
`)
  const markdown = plan.blocks.find((block) => block.type === 'markdown')
  assert.ok(markdown && markdown.type === 'markdown')
  const expected = cellIds(markdown.html)
  await show(`<article data-plan-rendered>${stripCellParts(markdown.html)}</article>`)
  const stamped = await stampCells()
  assert.deepEqual(stamped, expected)
  const resolved = await page.evaluate(() => {
    const resolve = (window as unknown as { __resolvePart: (start: Element | null) => HTMLElement | null }).__resolvePart
    const paragraph = document.querySelector('p')
    const item = document.querySelector('li')
    const cell = document.querySelector('td')
    const nested = cell?.querySelector('span') ?? cell
    return {
      paragraph: paragraph ? resolve(paragraph)?.dataset.planKind : null,
      item: item ? resolve(item)?.dataset.planKind : null,
      cell: nested ? resolve(nested)?.dataset.planKind : null,
      cellId: nested ? resolve(nested)?.dataset.planPart : null,
    }
  })
  assert.equal(resolved.paragraph, 'paragraph')
  assert.equal(resolved.item, 'list-item')
  assert.equal(resolved.cell, 'cell')
  assert.equal(resolved.cellId, markdownCellPartId('markdown:0', 3))
})

test('a phase table cell stays inside that phase', async () => {
  const plan = parsePlan(`<phase id="design" title="Design" status="active">
Intro.

| Step | State |
| --- | :---: |
| Parse | done |
</phase>
`)
  const phase = plan.blocks[0]
  assert.ok(phase && phase.type === 'phase')
  const expected = cellIds(phase.bodyHtml)
  await show(
    `<article data-plan-rendered><section data-entry="phase" data-entry-id="design"><h3 class="plan-title">Design</h3><div class="plan-rich">${stripCellParts(phase.bodyHtml)}</div></section></article>`,
  )
  assert.deepEqual(await stampCells(), expected)
  const kind = await page.evaluate(() => {
    const resolve = (window as unknown as { __resolvePart: (start: Element | null) => HTMLElement | null }).__resolvePart
    const intro = [...document.querySelectorAll('p')].find((node) => node.textContent === 'Intro.')
    const cell = document.querySelector('td')
    return {
      intro: intro ? resolve(intro)?.dataset.planPart : null,
      cell: cell ? resolve(cell)?.dataset.planPart : null,
    }
  })
  assert.equal(kind.intro, 'phase:design/paragraph:1')
  assert.equal(kind.cell, markdownCellPartId('phase:design', 3))
})

test('a data table cell keeps its row after the rows move', async () => {
  const gateway = dataTableCellToken('row-1', 'name')
  const limits = dataTableCellToken('row-2', 'name')
  await show(`<article data-plan-rendered>
    <p>Before the table.</p>
    <section data-entry="phase" data-entry-id="owners"><h3 class="plan-title">Owners</h3><div class="plan-rich">
      <div class="plan-data-table"><table>
        <thead><tr><th data-plan-cell="${dataTableCellToken('header', 'name')}">Name</th></tr></thead>
        <tbody>
          <tr data-row="row-1"><td data-plan-cell="${gateway}"><span>Gateway</span></td></tr>
          <tr data-row="row-2"><td data-plan-cell="${limits}">Limits</td></tr>
        </tbody>
      </table></div>
      <div class="plan-data-table"><table>
        <tbody><tr><td data-plan-cell="${dataTableCellToken('row-1', 'route')}">GET</td></tr></tbody>
      </table></div>
    </div></section>
  </article>`)
  await page.evaluate(() => {
    ;(window as unknown as { __stampPlanParts: (root: ParentNode) => void }).__stampPlanParts(document)
  })
  const before = await page.locator(`[data-plan-cell="${gateway}"]`).getAttribute('data-plan-part')
  assert.equal(before, dataTableCellPartId('phase:owners', 1, gateway))
  const second = await page.locator(`[data-plan-cell="${dataTableCellToken('row-1', 'route')}"]`).getAttribute('data-plan-part')
  assert.equal(second, dataTableCellPartId('phase:owners', 2, dataTableCellToken('row-1', 'route')))
  await page.evaluate((token) => {
    const row = document.querySelector(`[data-plan-cell="${token}"]`)?.closest('tr')
    row?.parentElement?.append(row)
    ;(window as unknown as { __stampPlanParts: (root: ParentNode) => void }).__stampPlanParts(document)
  }, gateway)
  const after = await page.locator(`[data-plan-cell="${gateway}"]`).getAttribute('data-plan-part')
  assert.equal(after, before)
  const fromSpan = await page.evaluate(() => {
    const resolve = (window as unknown as { __resolvePart: (start: Element | null) => HTMLElement | null }).__resolvePart
    const span = document.querySelector('span')
    const paragraph = document.querySelector('p')
    return {
      cell: span ? resolve(span)?.dataset.planPart : null,
      paragraph: paragraph ? resolve(paragraph)?.dataset.planKind : null,
    }
  })
  assert.equal(fromSpan.cell, dataTableCellPartId('phase:owners', 1, gateway))
  assert.equal(fromSpan.paragraph, 'paragraph')
  assert.match(before ?? '', partIdPattern)
})

test('stampPlanParts is the same function the page uses', () => {
  assert.equal(typeof stampPlanParts, 'function')
})

async function show(html: string): Promise<void> {
  await page.setContent(html)
  await page.evaluate(
    async ({ stampCode, partsCode }) => {
      const load = (code: string) => import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })))
      const stampMod = (await load(stampCode)) as { stampPlanParts: (root: ParentNode) => void }
      const partsMod = (await load(partsCode)) as {
        resolvePart: (start: Element | null) => HTMLElement | null
      }
      Object.assign(window, {
        __stampPlanParts: stampMod.stampPlanParts,
        __resolvePart: partsMod.resolvePart,
      })
    },
    { stampCode: stampSource, partsCode: partsSource },
  )
}

async function stampCells(): Promise<string[]> {
  return page.evaluate(() => {
    ;(window as unknown as { __stampPlanParts: (root: ParentNode) => void }).__stampPlanParts(document)
    return [...document.querySelectorAll<HTMLElement>('[data-plan-kind="cell"]')].map((cell) => cell.dataset.planPart ?? '')
  })
}

function cellIds(html: string): string[] {
  return [...html.matchAll(/data-plan-part="([^"]+)" data-plan-kind="cell"/g)].map((match) => match[1] ?? '')
}

function stripCellParts(html: string): string {
  return html.replace(/ data-plan-part="[^"]*" data-plan-kind="cell"/g, '')
}

async function bundle(entry: string): Promise<string> {
  const built = await Bun.build({
    entrypoints: [entry],
    format: 'esm',
    target: 'browser',
    write: false,
  })
  const output = built.outputs[0]
  if (!output) throw new Error(`Could not bundle ${entry}`)
  return output.text()
}
