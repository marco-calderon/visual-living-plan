import assert from 'node:assert/strict'
import test from 'node:test'
import { chromium, type Page } from '@playwright/test'
import { createIdleExecutionState } from '../src/execution.ts'
import { parsePlan } from '../src/parse.ts'
import { planRefHash } from '../src/planRefNavigation.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'

const filler = Array.from({ length: 36 }, (_, index) => {
  return `Paragraph ${index} keeps the column tall enough that a reference jump moves the page.`
}).join('\n\n')

const plan = parsePlan(
  `---
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
`,
  'reference-jumps.plan.md',
)

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

async function openPlan(html: string, hash = ''): Promise<{ page: Page; close: () => Promise<void> }> {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const errors: string[] = []
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })
  await page.route('http://plan.test/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
  })
  await page.goto(`http://plan.test/plan${hash}`, { waitUntil: 'domcontentloaded' })
  assert.deepEqual(errors, [])
  return {
    page,
    close: async () => {
      assert.deepEqual(errors, [])
      await browser.close()
    },
  }
}

test('workflow steps are same-page references', () => {
  assert.equal(planRefHash('design'), '#plan-design')
  assert.equal(planRefHash('fail mode'), '#plan-fail%20mode')
  const html = pageHtml()
  assert.match(html, /<a class="workflow-step" href="#plan-design" data-plan-jump="design"/)
  assert.match(html, /<a class="workflow-step" href="#plan-later" data-plan-jump="later"/)
  assert.match(html, /id="plan-design"/)
  assert.match(html, /history\.pushState/)
  assert.match(html, /popstate/)
  assert.match(html, /scrollRestoration = 'manual'/)
})

test('in-plan references jump on this page and Back restores the position', { timeout: 20_000 }, async () => {
  const { page, close } = await openPlan(pageHtml())
  try {
    const step = page.locator('a.workflow-step[data-plan-jump="design"]')
    await step.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'auto' }))
    const before = await page.evaluate(() => window.scrollY)
    assert.ok(before > 400, `expected a scrolled page, got ${before}`)

    await step.evaluate((node) => node.click())
    await page.waitForURL(/#plan-design$/)
    assert.match(page.url(), /\/plan#plan-design$/)
    await expectInView(page, '#plan-design')
    const jumped = await page.evaluate(() => window.scrollY)
    assert.ok(jumped < before - 200, `jump should leave the previous scroll, got ${jumped} from ${before}`)

    await historyBy(page, 'back')
    await page.waitForFunction((target) => Math.abs(window.scrollY - target) < 40, before)
    assert.equal(new URL(page.url()).hash, '')
    assert.equal(await page.locator('#plan-design').evaluate((node) => node.classList.contains('plan-ref-focus')), false)

    await historyBy(page, 'forward')
    await page.waitForURL(/#plan-design$/)
    await expectInView(page, '#plan-design')
  } finally {
    await close()
  }
})

test('hash links and bare refs stay on the page', { timeout: 20_000 }, async () => {
  const { page, close } = await openPlan(pageHtml())
  try {
    await page.evaluate(() => window.scrollTo(0, 480))
    const before = await page.evaluate(() => window.scrollY)

    await page.evaluate(() => {
      const link = document.createElement('a')
      link.id = 'hash-ref'
      link.href = '#plan-later'
      link.textContent = 'See later'
      link.style.cssText = 'position:fixed;top:8px;left:8px;z-index:20'
      document.body.append(link)
    })
    await page.locator('#hash-ref').click()
    await page.waitForURL(/#plan-later$/)
    assert.match(page.url(), /\/plan#plan-later$/)
    await expectInView(page, '#plan-later')

    await page.evaluate(() => window.scrollTo(0, 160))
    await page.evaluate(() => {
      const link = document.createElement('a')
      link.id = 'bare-ref'
      link.setAttribute('href', 'design')
      link.textContent = 'design'
      link.style.cssText = 'position:fixed;top:8px;left:8px;z-index:20'
      document.body.append(link)
    })
    await page.locator('#bare-ref').click()
    await page.waitForURL(/#plan-design$/)
    assert.match(page.url(), /\/plan#plan-design$/)
    await expectInView(page, '#plan-design')

    await historyBy(page, 'back')
    await page.waitForFunction((target) => Math.abs(window.scrollY - target) < 40, 160)
    assert.match(page.url(), /#plan-later$/)

    const external = await page.evaluate(() => {
      const link = document.createElement('a')
      link.href = 'https://example.com/outside'
      document.body.append(link)
      let prevented = true
      link.addEventListener('click', (event) => {
        prevented = event.defaultPrevented
        event.preventDefault()
      })
      link.click()
      return { prevented, href: location.href }
    })
    assert.equal(external.prevented, false)
    assert.match(external.href, /\/plan#plan-later$/)
    assert.ok(before > 0)
  } finally {
    await close()
  }
})

test('a hash in the address bar opens that entry without an extra history entry', async () => {
  const { page, close } = await openPlan(pageHtml(), '#plan-later')
  try {
    await expectInView(page, '#plan-later')
    assert.equal(await page.locator('#plan-later').evaluate((node) => node.classList.contains('plan-ref-focus')), true)
    assert.equal(await page.evaluate(() => history.state), null)
  } finally {
    await close()
  }
})

test('a plan step number or title opens the workflow and Back restores the plan', { timeout: 20_000 }, async () => {
  const { page, close } = await openPlan(pageHtml())
  try {
    const number = page.locator('#plan-later a.plan-step-number')
    await number.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'auto' }))
    const before = await page.evaluate(() => window.scrollY)
    assert.ok(before > 200, `expected a scrolled page, got ${before}`)
    assert.equal(await number.textContent(), '2')

    await number.evaluate((node) => node.click())
    await page.waitForURL(/#workflow\/later$/)
    assert.equal(await page.getByRole('tab', { name: 'Workflow' }).getAttribute('aria-selected'), 'true')
    assert.equal(await page.getByRole('tab', { name: 'Plan' }).getAttribute('aria-selected'), 'false')

    await historyBy(page, 'back')
    await page.waitForFunction((target) => {
      const plan = document.querySelector('[data-tab-target="plan"]')
      return plan?.getAttribute('aria-selected') === 'true' && location.hash === '' && Math.abs(window.scrollY - target) < 40
    }, before)

    const title = page.locator('#plan-design a.plan-step-label')
    await title.evaluate((node) => node.click())
    await page.waitForURL(/#workflow\/design$/)
    assert.equal(await page.getByRole('tab', { name: 'Workflow' }).getAttribute('aria-selected'), 'true')

    await historyBy(page, 'back')
    await page.waitForFunction((target) => {
      const plan = document.querySelector('[data-tab-target="plan"]')
      return plan?.getAttribute('aria-selected') === 'true' && location.hash === '' && Math.abs(window.scrollY - target) < 40
    }, before)

    await historyBy(page, 'forward')
    await page.waitForURL(/#workflow\/design$/)
    assert.equal(await page.getByRole('tab', { name: 'Workflow' }).getAttribute('aria-selected'), 'true')
    assert.equal(await page.getByRole('tab', { name: 'Plan' }).getAttribute('aria-selected'), 'false')
  } finally {
    await close()
  }
})

test('Back from a workflow-tab jump returns to that tab', { timeout: 20_000 }, async () => {
  const { page, close } = await openPlan(pageHtml())
  try {
    await page.getByRole('tab', { name: 'Workflow' }).click()
    await page.evaluate(() => {
      document.querySelector<HTMLAnchorElement>('a.workflow-step[data-plan-jump="later"]')?.click()
    })
    await page.waitForURL(/#plan-later$/)
    assert.equal(await page.getByRole('tab', { name: 'Plan' }).getAttribute('aria-selected'), 'true')
    await historyBy(page, 'back')
    await page.waitForFunction(() => {
      const selected = document.querySelector('[data-tab-target="workflow"]')
      return selected?.getAttribute('aria-selected') === 'true' && location.hash === ''
    })
  } finally {
    await close()
  }
})

async function historyBy(page: Page, direction: 'back' | 'forward'): Promise<void> {
  await page.evaluate((dir) => {
    if (dir === 'back') history.back()
    else history.forward()
  }, direction)
}

async function expectInView(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((target) => {
    const node = document.querySelector(target)
    if (!node) return false
    const box = node.getBoundingClientRect()
    return box.top < window.innerHeight && box.bottom > 0 && node.classList.contains('plan-ref-focus')
  }, selector)
}
