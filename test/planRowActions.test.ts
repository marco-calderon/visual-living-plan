import assert from 'node:assert/strict'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import test from 'node:test'
import { PlanVersionsMenu } from '../client/chrome/PlanVersionsMenu.tsx'
import { PlanRowActions } from '../src/routes/PlanRowActions.tsx'

function html(props: Parameters<typeof PlanRowActions>[0]): string {
  return renderToStaticMarkup(createElement(PlanRowActions, props))
}

function control(source: string, label: string): string {
  const marker = `aria-label="${label}"`
  const at = source.indexOf(marker)
  assert.ok(at >= 0, label)
  const start = source.lastIndexOf('<', at)
  const tag = source.slice(start + 1, source.indexOf(' ', start))
  const end = source.indexOf(`</${tag}>`, at)
  assert.ok(end > at, label)
  return source.slice(start, end + tag.length + 3)
}

test('plan actions render as icon buttons and versions includes a chevron', () => {
  const source = html({
    openUrl: 'http://127.0.0.1:9477/plans/abc/',
    fileUrl: '/archive/abc',
    planId: 'abc',
    showVersions: true,
  })

  for (const label of ['Open', 'Plan file', 'Versions']) {
    const node = control(source, label)
    assert.match(node, /plan-btn-ghost/)
    assert.match(node, /plan-action/)
    assert.doesNotMatch(node, new RegExp(`>\\s*${label}\\s*<`))
  }

  const open = control(source, 'Open')
  assert.match(open, /href="http:\/\/127\.0\.0\.1:9477\/plans\/abc\/"/)
  assert.match(open, /<svg/)

  const file = control(source, 'Plan file')
  assert.match(file, /href="\/archive\/abc"/)
  assert.match(file, /<svg/)

  const versions = control(source, 'Versions')
  assert.match(versions, /plan-action-menu/)
  assert.match(versions, /aria-haspopup="menu"/)
  assert.match(versions, /lucide-chevron-down/)
  assert.match(versions, /<svg[^>]*lucide-history/)
  assert.equal(source.match(/data-slot="tooltip-trigger"/g)?.length, 3)
})

test('the versions menu trigger is an icon button with a chevron', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const source = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(PlanVersionsMenu, {
        planId: 'abc',
        label: 'Versions',
        triggerClassName: '',
        iconOnly: true,
      }),
    ),
  )
  const versions = control(source, 'Versions')
  assert.match(versions, /plan-btn-ghost/)
  assert.match(versions, /plan-action-menu/)
  assert.match(versions, /lucide-chevron-down/)
  assert.doesNotMatch(versions, />\s*Versions\s*</)
  assert.match(versions, /data-slot="tooltip-trigger"/)
})

test('an offline plan file stays an icon button and does not navigate', () => {
  const source = html({
    fileUrl: '/archive/abc',
    offline: true,
  })
  const file = control(source, 'Plan file')
  assert.match(file, /plan-btn-ghost/)
  assert.match(file, /aria-disabled="true"/)
  assert.doesNotMatch(file, /href=/)
  assert.match(file, /data-slot="tooltip-trigger"/)
  assert.doesNotMatch(file, />\s*Plan file\s*</)
})
