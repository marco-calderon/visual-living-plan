import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import puppeteer from 'puppeteer-core'
import { createIdleExecutionState } from '../src/execution.ts'
import { parsePlan } from '../src/parse.ts'
import { renderPlanPage } from '../src/render.ts'
import { defaultThemeConfig, themePayload } from '../src/theme.ts'

type GrabSummary = {
  componentName: string | null
  filePath: string | null
  lineNumber: number | null
  columnNumber: number | null
  stackLength: number
  selector: string | null
  hasFiber: boolean
  snippet: string
}

type GrabReport = {
  planHeading: GrabSummary
  planParagraph: GrabSummary
  canvas: GrabSummary
}

const chromePath = [
  process.env.CHROME_PATH,
  '/usr/local/bin/google-chrome',
  '/usr/bin/google-chrome',
].find((path) => path && existsSync(path))

function isSummary(value: unknown): value is GrabSummary {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.snippet === 'string' && typeof record.hasFiber === 'boolean'
}

test('React Grab does not resolve plan-page sections to React source', { timeout: 30_000 }, async (t) => {
  if (!chromePath) {
    t.skip('Chrome is not installed')
    return
  }

  const built = await Bun.build({
    entrypoints: [new URL('./reactGrabProbe.tsx', import.meta.url).pathname],
    target: 'browser',
  })
  assert.equal(built.success, true, built.logs.map((log) => log.message).join('\n'))
  const probe = await built.outputs[0]?.text()
  assert.ok(probe)

  const pageHtml = renderPlanPage({
    plan: parsePlan(`# Probe

\`\`\`phase
id: design
title: Design
status: active
body: |
  The request path lives here.
\`\`\`

\`\`\`workflow
nodes:
  - id: design
    label: Design
edges: []
\`\`\`
`),
    mode: 'watch',
    responses: {},
    diffs: [],
    iteration: 1,
    pendingInteractionIds: [],
    execution: createIdleExecutionState(),
    clientAssets: null,
    theme: themePayload(defaultThemeConfig(), 'live-plan.config.json'),
  })
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace('</body>', '<script type="module" src="/probe.js"></script></body>')

  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const { pathname } = new URL(request.url)
      if (pathname === '/probe.js') {
        return new Response(probe, { headers: { 'content-type': 'text/javascript' } })
      }
      if (pathname === '/') {
        return new Response(pageHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } })
      }
      return new Response('not found', { status: 404 })
    },
  })

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  })

  try {
    const page = await browser.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => {
      pageErrors.push(error instanceof Error ? error.message : String(error))
    })
    await page.goto(server.url.origin, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    await page.waitForSelector('#grab-result', { timeout: 10_000 })
    const raw = await page.$eval('#grab-result', (element) => element.textContent ?? '')
    const report = JSON.parse(raw) as GrabReport & { error?: string }
    assert.equal(report.error, undefined, raw)
    assert.deepEqual(pageErrors, [])
    assert.equal(isSummary(report.planHeading), true)
    assert.equal(isSummary(report.planParagraph), true)
    assert.equal(isSummary(report.canvas), true)

    assert.equal(report.planHeading.hasFiber, false)
    assert.equal(report.planHeading.componentName, null)
    assert.equal(report.planHeading.filePath, null)
    assert.equal(report.planHeading.lineNumber, null)
    assert.equal(report.planHeading.stackLength, 0)
    assert.equal(report.planHeading.selector, '#plan-design')
    assert.match(report.planHeading.snippet, /Design/)
    assert.doesNotMatch(report.planHeading.snippet, /\(at /)

    assert.equal(report.planParagraph.hasFiber, false)
    assert.equal(report.planParagraph.componentName, null)
    assert.equal(report.planParagraph.filePath, null)
    assert.equal(report.planParagraph.lineNumber, null)
    assert.equal(report.planParagraph.stackLength, 0)
    assert.match(report.planParagraph.snippet, /The request path lives here/)
    assert.doesNotMatch(report.planParagraph.snippet, /\(at /)

    assert.equal(report.canvas.hasFiber, true)
    assert.match(report.canvas.snippet, /in CanvasLabel/)
    assert.match(report.canvas.filePath ?? '', /probe\.js/)
  } finally {
    await browser.close()
    server.stop(true)
  }
})
