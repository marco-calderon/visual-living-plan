import assert from 'node:assert/strict'
import test from 'node:test'
import { applyBlockEdit, applyCellEdit, blockEditorText, cellEditorText, cellMarkdown, samePlanSource } from '../src/planMdx/blockEdit.ts'
import { compilePlanMdx } from '../src/planMdx/compilePlanMdx.ts'
import { blockText, insertBlockAfter, mdxBodyOffset, parseBlockRange, parseCellRange, spliceBlock } from '../src/planMdx/remarkBlockRanges.ts'
import { planSourceToMdx } from '../src/planMdx/source.ts'

const plan = `---
title: Block edit
---

# Rollout

Ship the limiter behind a flag.

<phase id="build" title="Build it" status="active">
First line of the phase.

<callout kind="risk" title="Redis">
Redis can go away.
</callout>
</phase>

<choice id="mode" prompt="Fail open or closed?">
<option id="open" label="Open">Allow traffic.</option>
</choice>

<workflow id="flow" title="Flow">
\`\`\`workflow
build | Build it | build
mode | Pick a mode | mode
--
build -> mode
\`\`\`
</workflow>
`

/** Every block range the compiled page carries, with the text it points at. */
async function ranges(source: string): Promise<Array<{ range: { start: number; end: number }; text: string }>> {
  const compiled = String(await compilePlanMdx(planSourceToMdx(source)))
  return [...compiled.matchAll(/"data-plan-block": "(\d+-\d+)"/g)].map((match) => {
    const range = parseBlockRange(match[1])
    assert.ok(range)
    return { range, text: blockText(source, range) }
  })
}

async function rangeOf(source: string, starts: string) {
  const found = (await ranges(source)).find((entry) => entry.text.startsWith(starts))
  assert.ok(found, `no block starts with ${starts}`)
  return found.range
}

test('every top-level block and every block in a phase carries its place in the file', async () => {
  const texts = (await ranges(plan)).map((entry) => entry.text.split('\n')[0])
  assert.deepEqual(texts, [
    '# Rollout',
    'Ship the limiter behind a flag.',
    '<phase id="build" title="Build it" status="active">',
    'First line of the phase.',
    '<callout kind="risk" title="Redis">',
    '<choice id="mode" prompt="Fail open or closed?">',
    '<workflow id="flow" title="Flow">',
  ])
})

test('the ranges are offsets into the body after the front matter', () => {
  assert.equal(plan.slice(mdxBodyOffset(plan)).startsWith('# Rollout'), true)
  assert.equal(mdxBodyOffset('# Only a body\n'), 0)
  assert.equal(parseBlockRange('12-4'), null)
  assert.equal(parseBlockRange('x'), null)
})

test('a block edit replaces only that block and keeps the rest of the file byte for byte', async () => {
  const range = await rangeOf(plan, 'Ship the limiter')
  const next = applyBlockEdit(plan, { kind: 'replace', range, edited: 'Ship the limiter to everyone.' })
  assert.equal(next, plan.replace('Ship the limiter behind a flag.', 'Ship the limiter to everyone.'))
})

test('a block inside a phase is edited on its own', async () => {
  const range = await rangeOf(plan, '<callout')
  const editor = blockEditorText(plan, range)
  assert.match(editor, /^<callout kind="risk" title="Redis">/)
  const next = applyBlockEdit(plan, { kind: 'replace', range, edited: editor.replace('Redis can go away.', 'Redis can restart.') })
  assert.equal(next, plan.replace('Redis can go away.', 'Redis can restart.'))
})

test('the editor sees <plan-form> and the file keeps <form>', async () => {
  const source = '# Ask\n\n<form id="limits" prompt="Limits">\n<field name="n" label="N" type="number" />\n</form>\n'
  const range = await rangeOf(source, '<form')
  assert.match(blockEditorText(source, range), /^<plan-form id="limits"/)
  const next = applyBlockEdit(source, { kind: 'replace', range, edited: blockEditorText(source, range).replace('label="N"', 'label="Count"') })
  assert.match(next, /^<form id="limits" prompt="Limits">$/m)
  assert.match(next, /label="Count"/)
})

test('an empty edit removes the block and the blank line after it', async () => {
  const range = await rangeOf(plan, 'Ship the limiter')
  const next = applyBlockEdit(plan, { kind: 'replace', range, edited: '' })
  assert.match(next, /# Rollout\n\n<phase id="build"/)
  await compilePlanMdx(planSourceToMdx(next))
})

test('a new block goes after the block, or at the end of the plan', async () => {
  const after = await rangeOf(plan, 'First line of the phase.')
  const inside = applyBlockEdit(plan, { kind: 'insert', after, edited: 'A second line.' })
  assert.match(inside, /First line of the phase\.\n\nA second line\.\n\n<callout/)
  const end = applyBlockEdit(plan, { kind: 'insert', after: null, edited: 'The end.' })
  assert.match(end, /<\/workflow>\n\nThe end\.\n$/)
  assert.equal(applyBlockEdit(plan, { kind: 'insert', after: null, edited: '  ' }), plan)
})

test('a new phase added on the page gets a step on the workflow', async () => {
  const after = await rangeOf(plan, '<phase id="build"')
  const next = applyBlockEdit(plan, {
    kind: 'insert',
    after,
    edited: '<phase id="ship" title="Ship it" status="pending">\nRoll out.\n</phase>',
  })
  assert.match(next, /build \| Build it \| build\nship \| Ship it \| ship\nmode/)
  assert.match(next, /build -> ship\nship -> mode/)
  await compilePlanMdx(planSourceToMdx(next))
})

test('splice and insert work on raw ranges too', () => {
  const source = '---\na: 1\n---\n\nOne.\n\nTwo.\n'
  const two = { start: 6, end: 10 }
  assert.equal(blockText(source, two), 'Two.')
  assert.equal(spliceBlock(source, two, 'Deux.'), '---\na: 1\n---\n\nOne.\n\nDeux.\n')
  assert.equal(insertBlockAfter(source, { start: 0, end: 4 }, 'Half.'), '---\na: 1\n---\n\nOne.\n\nHalf.\n\nTwo.\n')
  assert.equal(samePlanSource('a\n', 'a\n\n'), true)
})

const table = `---
title: Cells
---

Limits per route.

| Route | Limit |
| --- | :---: |
| GET /health | none |
| POST /api/keys |  |
| a \\| b | \`code\` |
`

/** Every pipe table cell's place in the file, with the text it points at. */
async function cells(source: string): Promise<Array<{ range: { start: number; end: number }; text: string }>> {
  const compiled = String(await compilePlanMdx(planSourceToMdx(source)))
  return [...compiled.matchAll(/"data-plan-cell-range": "(\d+-\d+)"/g)].map((match) => {
    const range = parseCellRange(match[1])
    assert.ok(range)
    return { range, text: cellEditorText(source, range) }
  })
}

test('each pipe table cell carries the place of its text, and an empty cell the place its text would go', async () => {
  const found = await cells(table)
  assert.deepEqual(
    found.map((cell) => cell.text),
    ['Route', 'Limit', 'GET /health', 'none', 'POST /api/keys', '', 'a \\| b', '`code`'],
  )
  const empty = found[5]
  assert.equal(empty.range.start, empty.range.end)
  assert.equal(parseCellRange('12-12')?.start, 12)
  assert.equal(parseBlockRange('12-12'), null)
})

test('a cell edit changes only that cell, escapes its pipes, and keeps it on one line', async () => {
  const found = await cells(table)
  const none = found.find((cell) => cell.text === 'none')
  assert.ok(none)
  const next = applyCellEdit(table, none.range, 'none | yet\n')
  assert.equal(next, table.replace('| GET /health | none |', '| GET /health | none \\| yet |'))

  const route = found.find((cell) => cell.text === 'POST /api/keys')
  assert.ok(route)
  assert.equal(
    applyCellEdit(table, route.range, 'POST /api/keys\n\nand more\n'),
    table.replace('| POST /api/keys |  |', '| POST /api/keys and more |  |'),
  )

  const empty = found[5]
  assert.equal(applyCellEdit(table, empty.range, '600\n'), table.replace('| POST /api/keys |  |', '| POST /api/keys | 600 |'))
  // The new file still reads as the same table.
  assert.equal((await cells(applyCellEdit(table, empty.range, '600\n'))).length, 8)
})

test('cell text keeps escapes it has, and a space kept at a line end joins as a space', () => {
  assert.equal(cellMarkdown('a \\| b'), 'a \\| b')
  assert.equal(cellMarkdown('`x|y`'), '`x\\|y`')
  assert.equal(cellMarkdown('one&#x20;\n\ntwo\n'), 'one  two')
  assert.equal(cellMarkdown('line\\\nbreak'), 'line break')
})
