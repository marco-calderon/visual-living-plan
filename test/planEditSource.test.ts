import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'node:test'
import {
  flattenJsxIndent,
  fromEditorMarkdown,
  mergeEditedBody,
  planSourceFromEditor,
  splitFrontmatter,
  toEditorMarkdown,
  topEntryIds,
  wireNewSteps,
} from '../src/planMdx/editSource.ts'
import { planNotReadyReason } from '../src/planReady.ts'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { mdxFromMarkdown, mdxToMarkdown } from 'mdast-util-mdx'
import { toMarkdown } from 'mdast-util-to-markdown'
import { mdxjs } from 'micromark-extension-mdxjs'

const fixture = resolve('examples/rate-limit.plan.md')

test('form and option tags get editor names and come back', async () => {
  const { body } = splitFrontmatter(await readFile(fixture, 'utf8'))
  const editor = toEditorMarkdown(body)
  assert.match(editor, /<plan-form id="limits"/)
  assert.match(editor, /<\/plan-form>/)
  assert.match(editor, /<plan-option id="open"/)
  assert.doesNotMatch(editor, /<form\b|<option\b/)
  assert.equal(fromEditorMarkdown(editor), body)
})

test('a tag name inside a code fence is not renamed', () => {
  const body = '```html\n<form></form>\n```\n\n<form id="a" prompt="A">\n<field name="x" label="X" />\n</form>\n'
  const editor = toEditorMarkdown(body)
  assert.match(editor, /```html\n<form><\/form>\n```/)
  assert.match(editor, /<plan-form id="a"/)
})

test('untouched blocks keep the file text and only the changed block is rewritten', () => {
  const original = '# Title\n\nIntro   text.\n\n\n<phase id="a" title="A" status="pending">\nBody A.\n</phase>\n\n<phase id="b" title="B">\nBody B.\n</phase>\n'
  // The editor's own formatting of the same document, with one status changed.
  const edited = '# Title\n\nIntro   text.\n\n<phase id="a" title="A" status="done">\n  Body A.\n</phase>\n\n<phase id="b" title="B">\n  Body B.\n</phase>\n'
  assert.equal(
    mergeEditedBody(original, edited),
    '# Title\n\nIntro   text.\n\n<phase id="a" title="A" status="done">\nBody A.\n</phase>\n\n<phase id="b" title="B">\nBody B.\n</phase>\n',
  )
})

test('blank lines before a closing tag are dropped from a changed card', () => {
  assert.equal(flattenJsxIndent('<phase id="a" title="A">\n  Text.\n\n\n</phase>'), '<phase id="a" title="A">\nText.\n</phase>')
})

test('repeated blank lines in a changed card collapse, but not inside code', () => {
  assert.equal(
    flattenJsxIndent('<phase id="a" title="A">\n  One.\n\n\n\n  ```txt\n  x\n\n\n  y\n  ```\n</phase>'),
    '<phase id="a" title="A">\nOne.\n\n```txt\nx\n\n\ny\n```\n</phase>',
  )
})

test('a block that only moved keeps the file text', () => {
  const form = '<form id="f" prompt="F">\n<field name="a" label="A" />\n<field name="b" label="B" />\n</form>'
  const original = `One.\n\n${form}\n\n<phase id="p" title="P">\nBody.\n</phase>\n`
  // The editor writes the moved form with blank lines between its fields.
  const edited = 'One.\n\n<phase id="p" title="P">\n  Body.\n</phase>\n\n<form id="f" prompt="F">\n  <field name="a" label="A" />\n\n  <field name="b" label="B" />\n</form>\n'
  assert.equal(mergeEditedBody(original, fromEditorMarkdown(edited)), `One.\n\n<phase id="p" title="P">\nBody.\n</phase>\n\n${form}\n`)
})

test('an inserted block lands between the untouched ones, and a removed block is dropped', () => {
  assert.equal(mergeEditedBody('One.\n\nTwo.\n\nThree.\n', 'One.\n\nNew.\n\nThree.\n'), 'One.\n\nNew.\n\nThree.\n')
})

test('a changed nested card loses the editor indentation and keeps its code', () => {
  const edited = [
    '<choice id="c" prompt="Pick">',
    '  <option id="a" label="A">',
    '    Text A.',
    '  </option>',
    '',
    '  <option id="b" label="B">',
    '    ```ts',
    '    if (x) {',
    '      y()',
    '    }',
    '    ```',
    '  </option>',
    '</choice>',
  ].join('\n')
  assert.equal(
    flattenJsxIndent(edited),
    ['<choice id="c" prompt="Pick">', '<option id="a" label="A">', 'Text A.', '</option>', '', '<option id="b" label="B">', '```ts', 'if (x) {', '  y()', '}', '```', '</option>', '</choice>'].join('\n'),
  )
})

test('a new phase joins the workflow between its neighbours', () => {
  const body = [
    '<workflow id="w">',
    '```workflow',
    'a | A | a',
    'b | B | b',
    '--',
    'a -> b',
    '```',
    '</workflow>',
    '',
    '<phase id="a" title="A">',
    'x',
    '</phase>',
    '',
    '<phase id="new" title="New step">',
    'y',
    '</phase>',
    '',
    '<phase id="b" title="B">',
    'z',
    '</phase>',
    '',
  ].join('\n')
  const wired = wireNewSteps(body, new Set(['a', 'b']))
  assert.match(wired, /```workflow\na \| A \| a\nnew \| New step \| new\nb \| B \| b\n--\na -> new\nnew -> b\n```/)
  // A card that was already in the file is left out of the workflow on purpose.
  assert.equal(wireNewSteps(body, new Set(['a', 'b', 'new'])), body)
})

test('a callout is not added to the workflow', () => {
  const body = '<workflow id="w">\n```workflow\na | A | a\n--\n```\n</workflow>\n\n<phase id="a" title="A">\nx\n</phase>\n\n<callout id="c" title="C">\nnote\n</callout>\n'
  assert.equal(wireNewSteps(body, new Set(['a'])), body)
})

test('the example plan survives an edit through the editor helpers and still compiles', async () => {
  const source = await readFile(fixture, 'utf8')
  const { body } = splitFrontmatter(source)
  // What the editor writes: the same serializer, so every tag body is indented and spacing moves.
  const tree = fromMarkdown(toEditorMarkdown(body), { extensions: [mdxjs()], mdastExtensions: [mdxFromMarkdown()] })
  const editor = toMarkdown(tree, { extensions: [mdxToMarkdown()] })
  assert.notEqual(editor, toEditorMarkdown(body))
  const edited = `${editor.trim()}\n\n<phase id="verify" title="Verify in staging" status="pending">\nRun the load test.\n</phase>\n`
  const next = planSourceFromEditor({ source, edited })
  assert.ok(next.startsWith('---\ntitle: Rate limiting rollout'))
  assert.match(next, /<phase id="verify" title="Verify in staging"/)
  assert.match(next, /done-when -> verify/)
  assert.equal(await planNotReadyReason(next), undefined)
  // The workflow gains the step. Every card after it is the file as written, whatever the editor's spacing.
  const cards = source.slice(source.indexOf('<phase id="design"')).trimEnd()
  assert.ok(next.includes(cards))
  assert.ok(topEntryIds(splitFrontmatter(next).body).has('verify'))
})
