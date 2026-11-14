import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Approve } from '../client/entries/Approve.tsx'
import { Callout } from '../client/entries/Callout.tsx'
import { CardLabel } from '../client/entries/CardLabel.tsx'

test('a card label without an icon stays the plain kicker', () => {
  const html = renderToStaticMarkup(createElement(Approve, { id: 'go', prompt: 'Proceed?' }))
  assert.match(html, /<div class="plan-kicker">Approval gate<\/div>/)
  assert.doesNotMatch(html, /plan-card-icon/)
})

test('a named icon renders in a square before the label', () => {
  const html = renderToStaticMarkup(createElement(Approve, { id: 'go', prompt: 'Proceed?', icon: 'shield' }))
  assert.match(html, /class="plan-card-label" data-has-icon="true"/)
  assert.match(html, /<span class="plan-card-icon" aria-hidden="true"><svg[^>]*lucide-shield/)
  assert.match(html, /<span class="plan-card-label-text">Approval gate<\/span>/)
})

test('an unknown icon name falls back to the plain kicker', () => {
  const html = renderToStaticMarkup(createElement(CardLabel, { icon: 'nope' }, 'Label'))
  assert.equal(html, '<div class="plan-kicker">Label</div>')
})

test('a callout icon keeps the comment anchor on the label', () => {
  const html = renderToStaticMarkup(
    createElement(Callout, { id: 'redis', kind: 'risk', title: 'Redis', icon: 'alert' }),
  )
  const label = html.match(/<div[^>]*data-plan-part="callout:redis\/label"[^>]*>/)?.[0] ?? ''
  assert.match(label, /class="plan-card-label plan-callout-label"/)
  // The title's own text is marked, so the page edits it where it reads (ADR 0040); the kind is not.
  assert.match(html, /<span class="plan-card-label-text">risk · <span data-plan-title="title">Redis<\/span><\/span>/)
})

test('a card color tints the icon square, and an unknown color keeps the card tint', () => {
  const tinted = renderToStaticMarkup(createElement(Approve, { id: 'go', prompt: 'Proceed?', icon: 'rocket', color: 'Purple' }))
  assert.match(tinted, /<span class="plan-card-icon" data-color="purple" aria-hidden="true">/)
  const unknown = renderToStaticMarkup(createElement(CardLabel, { icon: 'rocket', color: 'teal' }, 'Label'))
  assert.match(unknown, /<span class="plan-card-icon" aria-hidden="true">/)
  const noIcon = renderToStaticMarkup(createElement(CardLabel, { color: 'blue' }, 'Label'))
  assert.equal(noIcon, '<div class="plan-kicker">Label</div>')
})

test('a callout passes its color to the icon', () => {
  const html = renderToStaticMarkup(
    createElement(Callout, { id: 'redis', kind: 'risk', title: 'Redis', icon: 'alert', color: 'orange' }),
  )
  assert.match(html, /data-color="orange"/)
})
