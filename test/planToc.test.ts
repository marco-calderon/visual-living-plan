import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { chromium, type Page } from '@playwright/test'
import { createIdleExecutionState } from '../src/execution.ts'
import { parsePlan } from '../src/parse.ts'
import { renderPlanStaticHtml } from '../src/planMdx/source.ts'
import { buildPlanToc, planTocHeadingIds } from '../src/planToc.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'

const filler = Array.from({ length: 36 }, (_, index) => {
  return `Paragraph ${index} keeps the column tall enough that a contents jump moves the page.`
}).join('\n\n')

const source = `---
title: Reference jumps
---

# Reference jumps

<phase id="design" title="Confirm limiter design" status="pending">
Start here.
</phase>

${filler}

<phase id="later" title="Later step" status="pending">
End of the plan.
</phase>

<workflow id="rollout" title="Expected execution">
design | Confirm limiter design | design
later | Later step | later
--
design -> later
</workflow>
`

const plan = parsePlan(source, 'contents.plan.md')

function pageHtml(): string {
  return renderPlanPage({
    plan,
    mode: 'watch',
    responses: {},
    diffs: [],
    iteration: 1,
    pendingInteractionIds: [],
    execution: createIdleExecutionState(),
    clientAssets: null,
    theme: themePayload(defaultThemeConfig(), 'live-plan.config.json'),
  })
}

test('contents list the plan sections and the workflow page', () => {
  const items = buildPlanToc(source)
  assert.equal(items[0]?.label, 'Reference jumps')
  assert.equal(items[0]?.headingId, 'plan-reference-jumps')
  assert.ok(items.some((item) => item.kind === 'section' && item.target === 'design' && item.label === 'Confirm limiter design'))
  assert.ok(items.some((item) => item.kind === 'section' && item.target === 'later'))
  const workflowAt = items.findIndex((item) => item.kind === 'workflow')
  assert.ok(workflowAt > 0)
  assert.equal(items[workflowAt]?.href, '#workflow')
  assert.deepEqual(
    items.slice(workflowAt + 1).map((item) => item.target),
    ['design', 'later'],
  )
  assert.ok(items.slice(workflowAt + 1).every((item) => item.kind === 'workflow-step' && item.depth === 1))

  const html = renderPlanStaticHtml(source)
  const headingIds = planTocHeadingIds(items)
  assert.equal([...html.matchAll(/data-plan-kind="heading"/g)].length, headingIds.length)
  for (const id of headingIds) assert.match(html, new RegExp(`id="${id}"`))

  const page = pageHtml()
  const shellAt = page.indexOf('<div class="shell">')
  const tocAt = page.indexOf('id="plan-toc"')
  assert.ok(tocAt > 0 && tocAt < shellAt)
  const column = page.slice(shellAt, page.indexOf('<div id="review-dock"'))
  assert.doesNotMatch(column, /id="plan-toc"|plan-toc-toggle|plan-toc-backdrop/)
  assert.match(page, /--shell-width:\s*min\(var\(--page-column\)/)
  assert.match(page, /left:\s*calc\(\(100% - var\(--shell-width\)\) \/ 2 - var\(--toc-width\) - var\(--toc-gap\)\)/)
  assert.match(page, /data-toc="workflow"/)
  assert.match(page, /data-toc="workflow-step"[^>]*data-toc-target="later"/)
  assert.match(page, /data-toc-toggle/)
})

test('the sample plan outlines phases and workflow steps', () => {
  const sample = readFileSync(new URL('../examples/rate-limit.plan.md', import.meta.url), 'utf8')
  const items = buildPlanToc(sample)
  assert.equal(items[0]?.label, 'Rate limiting rollout')
  assert.ok(items.some((item) => item.kind === 'section' && item.target === 'implement'))
  assert.ok(items.some((item) => item.kind === 'section' && item.target === 'done-when' && item.label === 'Done when'))
  const workflowAt = items.findIndex((item) => item.kind === 'workflow')
  assert.equal(items[workflowAt]?.label, 'Workflow')
  assert.ok(items.slice(workflowAt + 1).some((item) => item.kind === 'workflow-step' && item.target === 'fail-mode'))
  assert.ok(items.slice(0, workflowAt).every((item) => item.kind === 'section'))
})

async function openPlan(width: number, height = 800): Promise<{ page: Page; close: () => Promise<void> }> {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width, height } })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors: string[] = []
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })
  await page.route('http://plan.test/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: pageHtml() })
  })
  await page.goto('http://plan.test/plan', { waitUntil: 'domcontentloaded' })
  assert.deepEqual(errors, [])
  return {
    page,
    close: async () => {
      assert.deepEqual(errors, [])
      await browser.close()
    },
  }
}

async function box(page: Page, selector: string): Promise<{ x: number; width: number }> {
  return page.locator(selector).evaluate((node) => {
    const rect = node.getBoundingClientRect()
    return { x: rect.x, width: rect.width }
  })
}

async function historyBy(page: Page, direction: 'back' | 'forward'): Promise<void> {
  await page.evaluate((dir) => {
    if (dir === 'back') history.back()
    else history.forward()
  }, direction)
}

test('contents sit beside the column and do not change its width', { timeout: 30_000 }, async () => {
  const { page, close } = await openPlan(1440)
  try {
    const inside = await page.evaluate(() => {
      const shell = document.querySelector('.shell')
      return Boolean(shell?.querySelector('#plan-toc, .plan-toc-toggle, .plan-toc-backdrop'))
    })
    assert.equal(inside, false)

    const column = await box(page, '.shell')
    assert.ok(Math.abs(column.width - 720) < 2, `default column ${column.width}`)
    const toc = await box(page, '#plan-toc')
    assert.ok(toc.x + toc.width <= column.x - 8, `toc ${toc.x + toc.width} overlaps column ${column.x}`)
    assert.equal(await page.locator('.plan-toc-toggle').evaluate((node) => getComputedStyle(node).display), 'none')

    await page.evaluate(() => {
      document.documentElement.dataset.layout = 'wide'
      document.body.classList.remove('layout-default')
      document.body.classList.add('layout-wide')
    })
    const wide = await box(page, '.shell')
    assert.ok(Math.abs(wide.width - 1120) < 2, `wide column ${wide.width}`)
    assert.equal(await page.locator('.plan-toc-toggle').evaluate((node) => getComputedStyle(node).display), 'grid')

    await page.evaluate(() => {
      document.documentElement.dataset.layout = 'full'
      document.body.classList.remove('layout-wide')
      document.body.classList.add('layout-full')
    })
    const fullBefore = await box(page, '.shell')
    assert.ok(fullBefore.width > 1300, `full column ${fullBefore.width}`)
    await page.locator('.plan-toc-toggle').click()
    await page.waitForFunction(() => document.getElementById('plan-toc')?.dataset.open === 'true')
    const fullAfter = await box(page, '.shell')
    assert.ok(Math.abs(fullAfter.width - fullBefore.width) < 1, `full column changed ${fullBefore.width} -> ${fullAfter.width}`)
    const drawer = await box(page, '#plan-toc')
    assert.ok(drawer.width < fullAfter.width, 'sidebar should not become the column')
  } finally {
    await close()
  }
})

test('a contents link, including Workflow, is a history step', { timeout: 30_000 }, async () => {
  const { page, close } = await openPlan(1440)
  try {
    await page.evaluate(() => window.scrollTo(0, 180))
    const before = await page.evaluate(() => window.scrollY)
    assert.ok(before > 100 && before < 300, `setup scroll ${before}`)

    await page.locator('#plan-toc a[data-toc="section"][data-toc-target="later"]').click()
    await page.waitForURL(/#plan-later$/)
    const jumped = await page.evaluate(() => window.scrollY)
    assert.ok(jumped > before + 400, `section jump stayed at ${jumped}`)
    assert.equal(await page.locator('[data-tab-target="plan"]').getAttribute('aria-selected'), 'true')
    assert.equal(await page.locator('#plan-later').evaluate((node) => node.classList.contains('plan-ref-focus')), true)

    await historyBy(page, 'back')
    await page.waitForFunction((target) => Math.abs(window.scrollY - target) < 40 && location.hash === '', before)

    await page.locator('#plan-toc a[data-toc="workflow"]').click()
    await page.waitForURL(/#workflow$/)
    assert.equal(await page.locator('[data-tab-target="workflow"]').getAttribute('aria-selected'), 'true')
    assert.equal(await page.locator('[data-tab-target="plan"]').getAttribute('aria-selected'), 'false')

    await historyBy(page, 'back')
    await page.waitForFunction(() => {
      const plan = document.querySelector('[data-tab-target="plan"]')
      return plan?.getAttribute('aria-selected') === 'true' && location.hash === ''
    })

    await page.locator('#plan-toc a[data-toc="workflow-step"][data-toc-target="design"]').click()
    await page.waitForURL(/#workflow\/design$/)
    assert.equal(await page.locator('[data-tab-target="workflow"]').getAttribute('aria-selected'), 'true')

    await historyBy(page, 'back')
    await page.waitForFunction(() => {
      const plan = document.querySelector('[data-tab-target="plan"]')
      return plan?.getAttribute('aria-selected') === 'true' && location.hash === ''
    })
  } finally {
    await close()
  }
})

test('a narrow viewport opens contents as a sidebar without resizing the column', { timeout: 30_000 }, async () => {
  const { page, close } = await openPlan(390, 700)
  try {
    const before = await box(page, '.shell')
    assert.ok(before.width < 390, `column should be the viewport minus the page inset, got ${before.width}`)
    assert.equal(await page.locator('#plan-toc').evaluate((node) => node.getAttribute('data-open')), 'false')
    await page.locator('.plan-toc-toggle').click()
    await page.waitForFunction(() => document.getElementById('plan-toc')?.dataset.open === 'true')
    const after = await box(page, '.shell')
    assert.ok(Math.abs(after.width - before.width) < 1, `column changed ${before.width} -> ${after.width}`)
    const drawer = await box(page, '#plan-toc')
    assert.ok(drawer.x >= -1)
    assert.ok(drawer.width < before.width)

    await page.locator('#plan-toc a[data-toc="workflow"]').click()
    await page.waitForURL(/#workflow$/)
    await page.waitForFunction(() => document.getElementById('plan-toc')?.dataset.open === 'false')
    assert.equal(await page.locator('[data-tab-target="workflow"]').getAttribute('aria-selected'), 'true')
    const stayed = await box(page, '.shell')
    assert.ok(Math.abs(stayed.width - before.width) < 1)
  } finally {
    await close()
  }
})
