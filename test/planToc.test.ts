import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { chromium, type Page } from '@playwright/test'
import { createIdleExecutionState } from '../src/execution.ts'
import { parsePlan } from '../src/parse.ts'
import { renderPlanStaticHtml } from '../src/planMdx/source.ts'
import { buildPlanToc, planTocHeadingIds, renderTocItemsHtml } from '../src/planToc.ts'
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
  assert.match(page, /\.plan-toc-icon\s*\{[^}]*width:\s*18px/)
  assert.match(page, /\.plan-toc-icon\s*\{[^}]*border-radius:\s*6px/)
  assert.match(page, /\.plan-toc-icon svg\s*\{\s*width:\s*12px/)
  assert.match(page, /data-toc-icon="heading"\] \.plan-toc-icon\s*\{[^}]*background:\s*none/)
  assert.match(page, /data-toc-icon="workflow"\] \.plan-toc-icon\s*\{[^}]*background:\s*var\(--canvas\)/)
  assert.match(page, /left:\s*calc\(\(100% - var\(--shell-width\)\) \/ 2 - var\(--toc-width\) - var\(--toc-gap\)\)/)
  assert.match(page, /data-toc="workflow"/)
  assert.match(page, /data-toc="workflow-step"[^>]*data-toc-target="later"/)
  assert.match(page, /data-toc-toggle/)
  assert.match(page, /\.plan-toc a \* \{ pointer-events: none; \}/)
  assert.match(page, /\.plan-toc a \{[^}]*cursor: pointer;[^}]*touch-action: manipulation;/)
  assert.match(page, /@media \(hover: hover\) and \(pointer: fine\) \{\n {2}\.plan-toc a:hover \{ color: var\(--ink\); \}\n\}/)
  assert.match(page, /pointerType === 'mouse'/)
})

test('the sample plan outlines phases and workflow steps', () => {
  const sample = readFileSync(new URL('../examples/rate-limit.plan.md', import.meta.url), 'utf8')
  const items = buildPlanToc(sample)
  assert.equal(items[0]?.label, 'Rate limiting rollout')
  assert.equal(items[0]?.icon, 'heading')
  assert.ok(items.some((item) => item.kind === 'section' && item.target === 'implement'))
  assert.ok(items.some((item) => item.kind === 'section' && item.target === 'done-when' && item.label === 'Done when'))
  const workflowAt = items.findIndex((item) => item.kind === 'workflow')
  assert.equal(items[workflowAt]?.label, 'Workflow')
  assert.equal(items[workflowAt]?.icon, 'workflow')
  assert.ok(items.slice(workflowAt + 1).some((item) => item.kind === 'workflow-step' && item.target === 'fail-mode'))
  assert.ok(items.slice(0, workflowAt).every((item) => item.kind === 'section'))
})

test('contents icons follow the entry type, and steps follow phase progress', () => {
  const sample = readFileSync(new URL('../examples/rate-limit.plan.md', import.meta.url), 'utf8')
  const items = buildPlanToc(sample)
  const icon = (target: string, kind?: string) =>
    items.find((item) => item.target === target && (kind ? item.kind === kind : item.kind === 'section'))?.icon
  assert.equal(icon('design'), 'phase-done')
  assert.equal(icon('implement'), 'phase-active')
  assert.equal(icon('observe'), 'phase-pending')
  assert.equal(icon('redis-dependency'), 'callout-risk')
  assert.equal(icon('fail-mode'), 'choice')
  assert.equal(icon('limits'), 'form')
  assert.equal(icon('rollout-notes'), 'questions')
  assert.equal(icon('proceed-implement'), 'approve')
  assert.equal(icon('done-when'), 'checklist')
  assert.equal(icon('design', 'workflow-step'), 'phase-done')
  assert.equal(icon('implement', 'workflow-step'), 'phase-active')
  assert.equal(icon('fail-mode', 'workflow-step'), 'choice')
  assert.equal(icon('done-when', 'workflow-step'), 'checklist')
  assert.equal(items.find((item) => item.target === 'implement' && item.kind === 'section')?.tracksProgress, true)
  assert.equal(items.find((item) => item.target === 'fail-mode' && item.kind === 'workflow-step')?.tracksProgress, undefined)

  const html = renderTocItemsHtml(items)
  const implement = html.match(/<a [^>]*data-toc-target="implement"[^>]*>/)?.[0] ?? ''
  assert.match(implement, /data-toc-icon="phase-active"/)
  assert.match(implement, /data-toc-step/)
  assert.match(html, /data-icon="phase-done"/)
  assert.match(html, /data-icon="phase-pending"/)
  assert.match(html, /data-icon="phase-blocked"/)
  assert.match(html, /data-icon="phase-failed"/)
  const choice = html.match(/<a [^>]*data-toc-target="fail-mode"[^>]*>/)?.[0] ?? ''
  assert.match(choice, /data-toc-icon="choice"/)
  assert.doesNotMatch(choice, /data-toc-step/)
})

test('contents icons cover callout kinds and the other phase statuses', () => {
  const source = `---
title: Icons
---

# Custom gate

<callout id="note" kind="note" title="A note">Note.</callout>
<callout id="tip" kind="tip" title="A tip">Tip.</callout>
<callout id="warn" kind="warning" title="A warning">Warning.</callout>
<callout id="decide" kind="decision" title="Fail open stays the default">Decision.</callout>
<phase id="blocked" title="Blocked step" status="blocked">Blocked.</phase>
<phase id="failed" title="Failed step" status="failed">Failed.</phase>

<workflow id="rollout" title="Expected execution">
note | A note | note
blocked | Blocked step | blocked
--
note -> blocked
</workflow>
`
  const items = buildPlanToc(source)
  const icon = (target: string) => items.find((item) => item.kind === 'section' && item.target === target)?.icon
  assert.equal(items.find((item) => item.label === 'Custom gate')?.icon, 'heading')
  assert.equal(icon('note'), 'callout-note')
  assert.equal(icon('tip'), 'callout-tip')
  assert.equal(icon('warn'), 'callout-warning')
  assert.equal(icon('decide'), 'callout-decision')
  assert.equal(icon('blocked'), 'phase-blocked')
  assert.equal(icon('failed'), 'phase-failed')
  assert.equal(items.find((item) => item.kind === 'workflow-step' && item.target === 'note')?.icon, 'callout-note')
  assert.equal(items.find((item) => item.kind === 'workflow-step' && item.target === 'blocked')?.icon, 'phase-blocked')
  assert.equal(items.find((item) => item.kind === 'workflow-step' && item.target === 'blocked')?.tracksProgress, true)
})

async function openPlan(width: number, height = 800, touch = false): Promise<{ page: Page; close: () => Promise<void> }> {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch })
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

/** Touch pointer events only. Does not synthesize a click, which is what iPad skips. */
async function fingerTap(page: Page, selector: string, moveY = 0): Promise<number> {
  return page.locator(selector).evaluate((node, deltaY) => {
    const label = node.querySelector('.plan-toc-label') ?? node
    const rect = label.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    let clicks = 0
    const count = () => {
      clicks += 1
    }
    node.addEventListener('click', count)
    const base = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerId: 7,
      pointerType: 'touch' as const,
      isPrimary: true,
      button: 0,
      clientX: x,
      clientY: y,
    }
    label.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1 }))
    label.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, clientY: y + deltaY }))
    node.removeEventListener('click', count)
    return clicks
  }, moveY)
}

test('a touch on a contents row navigates on an iPad-sized screen', { timeout: 30_000 }, async () => {
  const { page, close } = await openPlan(1366, 1024, true)
  try {
    assert.equal(await page.locator('#plan-toc').evaluate((node) => node.hasAttribute('inert')), false)
    assert.equal(
      await page.locator('#plan-toc a[data-toc="section"][data-toc-target="later"] .plan-toc-label').evaluate((node) => getComputedStyle(node).pointerEvents),
      'none',
    )
    const before = await page.evaluate(() => history.length)
    const clicks = await fingerTap(page, '#plan-toc a[data-toc="section"][data-toc-target="later"]')
    assert.equal(clicks, 0)
    await page.waitForURL(/#plan-later$/)
    assert.equal(await page.evaluate(() => history.length), before + 1)

    const slid = await fingerTap(page, '#plan-toc a[data-toc="section"][data-toc-target="design"]', 48)
    assert.equal(slid, 0)
    assert.match(page.url(), /#plan-later$/)

    await page.locator('#plan-toc a[data-toc="section"][data-toc-target="design"]').tap()
    await page.waitForURL(/#plan-design$/)
    assert.equal(await page.evaluate(() => history.length), before + 2)

    await page.setViewportSize({ width: 820, height: 1180 })
    await page.waitForFunction(() => {
      const nav = document.getElementById('plan-toc')
      return nav && getComputedStyle(nav).getPropertyValue('--toc-dock').trim() !== '1' && nav.dataset.open !== 'true'
    })
    await page.locator('.plan-toc-toggle').tap()
    await page.waitForFunction(() => document.getElementById('plan-toc')?.dataset.open === 'true')
    const drawerClicks = await fingerTap(page, '#plan-toc a[data-toc="workflow"]')
    assert.equal(drawerClicks, 0)
    await page.waitForURL(/#workflow$/)
    await page.waitForFunction(() => document.getElementById('plan-toc')?.dataset.open === 'false')
    assert.equal(await page.locator('[data-tab-target="workflow"]').getAttribute('aria-selected'), 'true')
  } finally {
    await close()
  }
})
