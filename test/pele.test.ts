import assert from 'node:assert/strict'
import test from 'node:test'
import { render } from 'pele'

test('pele draws flowchart nodes and edges the comment tool can target', () => {
  const { svg } = render(`flowchart LR
  A[Start] --> B[End]`)
  assert.match(svg, /class="pele pele-flowchart"/)
  assert.match(svg, /class="pele-node[^"]*" data-id="A"/)
  assert.match(svg, /class="pele-edge" data-id="[^"]+"/)
  assert.match(svg, /var\(--pele-fg/)
  assert.match(svg, /var\(--pele-surface/)
  assert.match(svg, /var\(--pele-accent/)
})

test('pele pie slices use the theme series palette', () => {
  const { svg } = render(`pie title Pets
  "Dogs" : 40
  "Cats" : 35`)
  assert.match(svg, /class="pele-slice" data-id="Dogs"/)
  assert.match(svg, /class="pele-legend-item" data-id="Cats"/)
  assert.match(svg, /var\(--pele-series-1/)
  assert.match(svg, /var\(--pele-series-2/)
})

test('pele draws sequence actors, messages, and notes as separate parts', () => {
  const { svg } = render(`sequenceDiagram
  participant Client
  participant Gateway
  Client->>Gateway: Request
  Note over Client,Gateway: Check the window`)
  assert.match(svg, /class="pele-node pele-actor[^"]*" data-id="Client"/)
  assert.match(svg, /class="pele-edge pele-message"/)
  assert.match(svg, /class="pele-note"/)
})

test('a diagram pele cannot parse throws instead of emitting a figure', () => {
  assert.throws(() => render('flowchart LR\n  -->'))
})
