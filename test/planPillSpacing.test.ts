import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Phase } from '../client/entries/Phase.tsx'
import { Pill } from '../client/entries/Pill.tsx'

test('plan step pills leave a gap before the paragraph under them', () => {
  const html = renderToStaticMarkup(
    createElement(
      Phase,
      { title: 'Publish' },
      createElement(Pill, null, 'https URL'),
      createElement(Pill, null, 'cloudId in frontmatter'),
      createElement(Pill, null, 'no loopback fallback'),
      createElement('p', null, 'The command is published on the hosted origin.'),
    ),
  )
  assert.match(html, /class="plan-rich"/)
  assert.match(html, /no loopback fallback<\/span><p>The command is published on the hosted origin\.<\/p>/)

  const css = readFileSync(new URL('../client/entries/primitives.css', import.meta.url), 'utf8')
  const shorthand = css.indexOf('.plan-rich p,\n.plan-document > p { margin: 0 0 var(--space-sm); }')
  const gap = css.indexOf('.plan-rich > :is(.plan-pill, .plan-chip) + p')
  assert.ok(shorthand >= 0)
  assert.ok(gap > shorthand)
  assert.match(css.slice(gap, gap + 180), /margin-top:\s*var\(--space-sm\)/)
})
