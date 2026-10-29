import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ItemContext } from '../client/entries/entryContext.ts'
import { Item } from '../client/entries/Item.tsx'

function question(body: ReactNode, index = 0): string {
  return renderToStaticMarkup(
    createElement(
      ItemContext.Provider,
      { value: { mode: 'questions', disabled: false } },
      createElement(Item, { index }, body),
    ),
  )
}

test('a question number stays on the same line as a paragraph body', () => {
  const html = question(createElement('p', null, 'Which environments should receive the flag first?'))
  assert.match(html, /class="plan-question-line"/)
  assert.match(html, /class="plan-question-index">1\.<\/span>/)
  assert.match(html, /class="plan-question-text"><p>Which environments should receive the flag first\?<\/p><\/span>/)
  assert.match(html, /placeholder="Your answer"/)
  const line = html.match(/<span class="plan-question-line">[\s\S]*?<\/span><\/span>/)?.[0] ?? ''
  assert.match(line, /1\./)
  assert.match(line, /Which environments should receive the flag first\?/)
  assert.doesNotMatch(html, /<textarea[\s\S]*plan-question-line/)
})

test('a plain question string stays beside its number', () => {
  const html = question('Is there an existing dashboard the agent should extend?', 1)
  assert.match(html, /class="plan-question-index">2\.<\/span>/)
  assert.match(html, /class="plan-question-text">Is there an existing dashboard the agent should extend\?<\/span>/)
})

test('question lines share a row in light and dark', () => {
  const css = readFileSync(new URL('../client/entries/primitives.css', import.meta.url), 'utf8')
  assert.match(css, /\.plan-question-line\s*\{[^}]*display:\s*flex/)
  assert.match(css, /\.plan-question-line\s*\{[^}]*flex-direction:\s*row/)
  assert.match(css, /\.plan-question-line\s*\{[^}]*align-items:\s*baseline/)
  assert.match(css, /\.plan-question-text :is\(p\)\s*\{[^}]*display:\s*inline/)
  assert.match(css, /\.plan-question-text :is\(p\)\s*\{[^}]*margin:\s*0/)
  assert.match(css, /--muted:\s*var\(--steel\)/)
  const dark = css.split(':root[data-theme="dark"]')[1] ?? ''
  assert.match(dark, /--muted:/)
  assert.doesNotMatch(css, /\.plan-checkbox[^{]*\{[^}]*plan-question/)
})
