import assert from 'node:assert/strict'
import test from 'node:test'
import { renderMermaidSvg } from '../client/mdx/Mermaid.tsx'

test('Pele draws a mermaid figure for the plan page', () => {
  const svg = renderMermaidSvg('flowchart LR\n  Client --> Gateway', 'plan-diagram-test')
  assert.match(svg, /<svg/)
  assert.match(svg, /pele-/)
})
