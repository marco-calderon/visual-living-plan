import assert from 'node:assert/strict'
import test from 'node:test'
import { applyBlockEdit, blockEditorText } from '../src/planMdx/blockEdit.ts'
import { compilePlanMdx } from '../src/planMdx/compilePlanMdx.ts'
import { blockText, parseBlockRange } from '../src/planMdx/remarkBlockRanges.ts'
import { planSourceToMdx } from '../src/planMdx/source.ts'
import { applyTitleEdit, attributeValueAt, titleAttributeText, titleRange } from '../src/planMdx/titleEdit.ts'

// Text inside a card and a card's title are edited where they read (ADR 0040).

const plan = `---
title: In place
---

# In place

<callout kind="note" title="Context">
A callout's paragraph.

- one
- two
</callout>

<phase id="build" title="3. Build the limiter" status="active">
Phase text.

<callout kind="risk" title='Redis "down"'>
Redis can go away.
</callout>
</phase>

<Update health="on-track" by="Agent">
On track this week.
</Update>

<Tabs>
<Tab label="Design">
The bucket refills.
</Tab>
</Tabs>

<Box surface="panel">
Text in a box.

  Indented text in a box.
</Box>

<approve id="go" prompt="Proceed with the rollout?">
An approval's note.
</approve>

<choice id="mode" prompt="Fail open or closed?">
Pick how the limiter fails.

<option id="open" label="Open">
Allow traffic.
</option>
</choice>

<Endpoint method="POST" path="/api/keys">
Set the limit.
</Endpoint>

<workflow id="flow" title="Flow">
\`\`\`workflow
build | Build the limiter | build
--
\`\`\`
</workflow>
`

async function stamped(source: string, attr: string): Promise<Array<{ range: { start: number; end: number }; text: string }>> {
  const compiled = String(await compilePlanMdx(planSourceToMdx(source)))
  return [...compiled.matchAll(new RegExp(`"${attr}": "(\\d+-\\d+)"`, 'g'))].map((match) => {
    const range = parseBlockRange(match[1])
    assert.ok(range)
    return { range, text: blockText(source, range) }
  })
}

test('text a card draws as prose carries the place of its text, and no new block', async () => {
  const texts = (await stamped(plan, 'data-plan-text')).map((entry) => entry.text)
  assert.deepEqual(texts, [
    "A callout's paragraph.",
    '- one\n- two',
    'Redis can go away.',
    'On track this week.',
    'The bucket refills.',
    'Text in a box.',
    "An approval's note.",
    'Pick how the limiter fails.',
  ])
  // An option's text, an endpoint's, and indented text are their card's to edit.
  assert.ok(!texts.includes('Allow traffic.'))
  assert.ok(!texts.includes('Set the limit.'))
  assert.ok(!texts.some((text) => text.includes('Indented')))
  // Blocks that move are the same as before: text in a card has no grip.
  const blocks = (await stamped(plan, 'data-plan-block')).map((entry) => entry.text.split('\n')[0])
  assert.ok(!blocks.includes("A callout's paragraph."))
  assert.ok(!blocks.includes('Redis can go away.'))
})

test('an edit of text in a card changes only that text', async () => {
  const found = (await stamped(plan, 'data-plan-text')).find((entry) => entry.text === 'Redis can go away.')
  assert.ok(found)
  assert.equal(blockEditorText(plan, found.range), 'Redis can go away.')
  const next = applyBlockEdit(plan, { kind: 'replace', range: found.range, edited: 'Redis can go away for a minute.\n' })
  assert.equal(next, plan.replace('Redis can go away.', 'Redis can go away for a minute.'))
  await compilePlanMdx(planSourceToMdx(next))
})

async function blockStarting(source: string, starts: string) {
  const found = (await stamped(source, 'data-plan-block')).find((entry) => entry.text.startsWith(starts))
  assert.ok(found, `no block starts with ${starts}`)
  return found.range
}

test("a title's place is the part of its attribute the page shows", async () => {
  const phase = await blockStarting(plan, '<phase')
  const shown = titleRange(plan, phase, 'title', 'Build the limiter')
  assert.ok(shown)
  assert.equal(shown.quote, '"')
  // The step number before the title stays out of it.
  assert.equal(blockText(plan, shown), 'Build the limiter')

  const choice = await blockStarting(plan, '<choice')
  const prompt = titleRange(plan, choice, 'prompt', 'Fail open or closed?')
  assert.ok(prompt)
  assert.equal(blockText(plan, prompt), 'Fail open or closed?')

  const workflow = await blockStarting(plan, '<workflow')
  assert.equal(blockText(plan, titleRange(plan, workflow, 'title', 'Flow')!), 'Flow')

  // Single quotes, with double quotes inside.
  const risk = await blockStarting(plan, '<callout kind="risk"')
  const single = titleRange(plan, risk, 'title', 'Redis "down"')
  assert.ok(single)
  assert.equal(single.quote, "'")

  // No such attribute, or text the page does not show as written.
  assert.equal(titleRange(plan, choice, 'title', 'Fail open or closed?'), null)
  assert.equal(titleRange(plan, phase, 'title', 'Something else'), null)
})

test('an attribute is found past expressions and other strings in the tag', () => {
  const tag = `<phase data={{ title: "not this" }} label='x > y' title="This one">`
  const found = attributeValueAt(tag, 0, 'title')
  assert.ok(found)
  assert.equal(tag.slice(found.start, found.end), 'This one')
  assert.equal(attributeValueAt(tag, 0, 'status'), null)
  assert.equal(attributeValueAt('not a tag', 0, 'title'), null)
})

test('a title edit changes only the bytes of the title, as one line, with its quote escaped', async () => {
  const phase = await blockStarting(plan, '<phase')
  const range = titleRange(plan, phase, 'title', 'Build the limiter')!
  const next = applyTitleEdit(plan, range, 'Build the "new"\nlimiter & tests')
  assert.equal(next, plan.replace('title="3. Build the limiter"', 'title="3. Build the &quot;new&quot; limiter & tests"'))
  const compiled = String(await compilePlanMdx(planSourceToMdx(next)))
  assert.match(compiled, /3\. Build the \\"new\\" limiter & tests/)

  const risk = await blockStarting(plan, '<callout kind="risk"')
  const single = titleRange(plan, risk, 'title', 'Redis "down"')!
  assert.equal(applyTitleEdit(plan, single, "Redis isn't up"), plan.replace(`title='Redis "down"'`, `title='Redis isn&#39;t up'`))

  // An emptied title keeps the file as it was.
  assert.equal(applyTitleEdit(plan, range, '   '), plan)
})

test('text that would read as a character reference is written so it reads as typed', () => {
  assert.equal(titleAttributeText('Fish &amp; chips', '"'), 'Fish &amp;amp; chips')
  assert.equal(titleAttributeText('Q&A', '"'), 'Q&A')
  assert.equal(titleAttributeText('a b', '"'), 'a b')
})
