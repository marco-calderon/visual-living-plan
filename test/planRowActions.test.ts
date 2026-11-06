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

test('a row shows Open and one More actions button', () => {
  const source = html({
    openUrl: 'http://127.0.0.1:9477/plans/abc/',
    fileUrl: '/archive/abc',
    planId: 'abc',
    showVersions: true,
    onDelete: () => {},
  })

  const open = control(source, 'Open')
  assert.match(open, /plan-btn-ghost/)
  assert.match(open, /plan-action/)
  assert.match(open, /href="http:\/\/127\.0\.0\.1:9477\/plans\/abc\/"/)
  assert.match(open, /<svg/)
  assert.doesNotMatch(open, />\s*Open\s*</)

  const more = control(source, 'More actions')
  assert.match(more, /plan-btn-ghost/)
  assert.match(more, /aria-haspopup="menu"/)
  assert.match(more, /lucide-ellipsis|lucide-more-horizontal/)

  // Plan file, Versions, and Delete live in the menu, not on the row.
  assert.doesNotMatch(source, /aria-label="Plan file"/)
  assert.doesNotMatch(source, /aria-label="Versions"/)
  assert.equal(source.match(/class="[^"]*\bplan-action\b[^"]*"/g)?.length, 2)
})

test('a finished plan shows only the menu', () => {
  const source = html({ fileUrl: '/archive/abc', onDelete: () => {} })
  assert.doesNotMatch(source, /aria-label="Open"/)
  control(source, 'More actions')
})

test('a row with no actions renders nothing', () => {
  assert.equal(html({}), '')
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
