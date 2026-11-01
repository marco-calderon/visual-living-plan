import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { renderMermaidSvg } from '../client/mdx/Mermaid.tsx'

test('Pele draws a mermaid figure for the plan page', () => {
  const svg = renderMermaidSvg('flowchart LR\n  Client --> Gateway', 'plan-diagram-test')
  assert.match(svg, /<svg/)
  assert.match(svg, /pele-/)
})

test('rendered plans mount the mermaid viewer on local and hosted shells', () => {
  const figure = readFileSync(new URL('../client/mdx/Mermaid.tsx', import.meta.url), 'utf8')
  const shell = readFileSync(new URL('../src/PlanShell.tsx', import.meta.url), 'utf8')
  assert.match(figure, /renderMermaidFigure/)
  assert.match(shell, /sourceFlags\.mermaid/)
  assert.match(shell, /import\('\.\.\/client\/mermaid\.ts'\)/)
})
