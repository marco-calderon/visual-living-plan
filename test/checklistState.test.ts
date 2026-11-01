import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ItemContext } from '../client/entries/entryContext.ts'
import { Item } from '../client/entries/Item.tsx'

function checklistItem(done: boolean, body: ReactNode): string {
  return renderToStaticMarkup(
    createElement(
      ItemContext.Provider,
      { value: { mode: 'checklist', disabled: true } },
      createElement(Item, { done }, body),
    ),
  )
}

test('a checklist line keeps its text and shows state as an icon', () => {
  const done = checklistItem(true, 'All 11 API link states render a label')
  assert.match(done, /data-state="done"/)
  assert.match(done, /class="lucide lucide-circle-check/)
  assert.match(done, /<circle /)
  assert.match(done, /<path /)
  assert.match(done, /class="plan-check-name">Done</)
  assert.match(done, /class="plan-check-text">All 11 API link states render a label</)
  assert.doesNotMatch(done, />done</)
  assert.doesNotMatch(done, />DONE</)
  assert.doesNotMatch(done, /type="checkbox"/)

  const todo = checklistItem(false, 'Review loop ends with no findings')
  assert.match(todo, /data-state="todo"/)
  assert.match(todo, /class="lucide lucide-circle"/)
  assert.match(todo, /<circle /)
  assert.doesNotMatch(todo, /<path /)
  assert.match(todo, /class="plan-check-name">To do</)
  assert.match(todo, /class="plan-check-text">Review loop ends with no findings</)
  assert.doesNotMatch(todo, />todo</)
  assert.doesNotMatch(todo, />TODO</)
  assert.doesNotMatch(todo, /class="lucide lucide-circle-check/)
})

test('done and not-done stay distinct without color in light and dark', () => {
  const css = readFileSync(new URL('../client/entries/primitives.css', import.meta.url), 'utf8')
  assert.match(css, /\.plan-check\[data-state="done"\]\s*\{[^}]*color:\s*var\(--on-primary\)/)
  assert.match(css, /\.plan-check\[data-state="done"\] circle\s*\{[^}]*fill:\s*var\(--ok\)/)
  assert.match(css, /\.plan-check\[data-state="done"\] circle\s*\{[^}]*stroke:\s*var\(--ok\)/)
  assert.match(css, /\.plan-check\[data-state="todo"\] circle\s*\{[^}]*fill:\s*none/)
  assert.match(css, /\.plan-check\[data-state="todo"\] circle\s*\{[^}]*stroke:\s*currentColor/)
  assert.match(css, /\.plan-check\s*\{[^}]*color:\s*var\(--muted\)/)
  assert.match(css, /\.plan-check-text\s*\{[^}]*font-family:\s*var\(--font-body\)/)
  assert.match(css, /--font-body:\s*"DM Sans"/)
  assert.doesNotMatch(css, /\.plan-check-item\.is-done \.plan-check\s*\{[^}]*color:\s*var\(--ok\)/)

  const dark = css.split(':root[data-theme="dark"]')[1] ?? ''
  assert.match(dark, /--ok:\s*#6edb8f/)
  assert.match(dark, /--on-primary:\s*#171717/)
  assert.match(dark, /--muted:\s*var\(--steel\)/)
  assert.match(dark, /--ink:\s*#ededed/)
})
