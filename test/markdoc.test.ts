import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parsePlan } from '../src/parse.ts'
import { renderPlanStaticHtml } from '../src/planMdx/source.ts'
import { measurePlan } from '../src/planProgress.ts'
import { workflowRequirementError } from '../src/workflow.ts'

test('an MDX plan still exposes the rate-limit phases, interactions, and workflow', () => {
  const source = readFileSync(new URL('../examples/rate-limit.plan.md', import.meta.url), 'utf8')
  const plan = parsePlan(source, 'examples/rate-limit.plan.md')

  assert.equal(workflowRequirementError(plan), undefined)
  assert.deepEqual(plan.interactionIds, ['fail-mode', 'limits', 'rollout-notes', 'proceed-implement'])

  const phases = plan.blocks.filter((block) => block.type === 'phase')
  assert.deepEqual(
    phases.map((block) => (block.type === 'phase' ? [block.id, block.status] : [])),
    [
      ['design', 'done'],
      ['implement', 'active'],
      ['observe', 'pending'],
    ],
  )
  const progress = measurePlan(plan, [])
  assert.equal(progress.phaseTotal, 3)
  assert.equal(progress.phaseDone, 1)
  assert.equal(progress.interactionTotal, 4)
  assert.equal(progress.completionState, 'in_progress')

  const design = phases.find((block) => block.type === 'phase' && block.id === 'design')
  assert.ok(design && design.type === 'phase')
  assert.match(design.bodyHtml, /class="mermaid-diagram"/)
  assert.doesNotMatch(design.bodyHtml, /data-lang="mermaid"/)

  const implement = phases.find((block) => block.type === 'phase' && block.id === 'implement')
  assert.ok(implement && implement.type === 'phase')
  assert.match(implement.bodyHtml, /data-lang="ts"/)
  assert.match(implement.bodyHtml, /data-diff="true"/)

  const form = plan.blocks.find((block) => block.type === 'form')
  assert.ok(form && form.type === 'form')
  assert.equal(form.fields.find((field) => field.name === 'max_rps')?.default, 120)

  const workflow = plan.blocks.find((block) => block.type === 'workflow')
  assert.ok(workflow && workflow.type === 'workflow')
  assert.equal(workflow.nodes.length, 9)
  const choice = plan.blocks.find((block) => block.type === 'choice')
  assert.ok(choice && choice.type === 'choice')
  assert.equal(choice.options[0]?.id, 'open')
  assert.match(choice.options[0]?.description ?? '', /Allow traffic/)
})

test('a callout can contain a choice', () => {
  const plan = parsePlan(`<callout id="redis" kind="risk" title="Redis dependency">
A Redis outage must not take down the API.

<choice id="fail-mode" prompt="If Redis is unreachable, how should the limiter behave?">
<option id="open" label="Fail open">Allow traffic.</option>
<option id="closed" label="Fail closed">
Reject traffic if Redis is down.
</option>
</choice>
</callout>
`)

  assert.equal(plan.blocks.length, 1)
  assert.equal(plan.blocks[0]?.type, 'callout')
  assert.equal(plan.blocks.some((block) => block.type === 'choice'), false)
  assert.deepEqual(plan.interactionIds, ['fail-mode'])
  assert.deepEqual(
    plan.entries?.map((entry) => entry.type),
    ['callout', 'choice'],
  )
  const choice = plan.entries?.find((entry) => entry.type === 'choice')
  assert.equal(choice?.id, 'fail-mode')
})

test('a callout composes a nested choice', () => {
  const plan = parsePlan(`<callout id="ship" kind="note" title="Rollout">
The limiter is active at the gateway.

<choice id="fail-mode" prompt="If Redis is unreachable?">
<option id="open" label="Fail open">Allow traffic.</option>
</choice>
</callout>
`)

  assert.equal(plan.blocks.length, 1)
  assert.equal(plan.blocks[0]?.type, 'callout')
  assert.deepEqual(plan.interactionIds, ['fail-mode'])
  assert.equal(plan.entries?.some((entry) => entry.type === 'choice'), true)
})

test('a checkbox field stays a form interaction inside layout and a checklist stays file-authored', () => {
  const source = `<form id="access" prompt="Which access should this key have?">
<field name="direct" label="Direct" type="checkbox" options="read, write" />
<VStack>
<field name="scopes" label="Scopes" type="checkbox" required="true" options="read, write, admin" default="read, write" />
<field name="agree" label="Remember this key" type="checkbox" default="true" />
</VStack>
</form>
<callout id="note" kind="note" title="Access">
<form id="scopes" prompt="Scopes inside a callout">
<VStack>
<field name="scopes" label="Scopes" type="checkbox" options="read, write, admin" />
</VStack>
</form>
</callout>
<checklist id="done-when" title="Done when">
<item done="true">File authored</item>
<item done="false">Still open</item>
</checklist>
<workflow id="flow" title="Flow">
\`\`\`workflow
access | Choose access | access
--
access -> access
\`\`\`
</workflow>
`
  const plan = parsePlan(source)
  const form = plan.blocks.find((block) => block.type === 'form')
  assert.ok(form && form.type === 'form')
  assert.equal(form.fields.find((field) => field.name === 'direct')?.type, 'checkbox')
  const scopes = form.fields.find((field) => field.name === 'scopes')
  assert.equal(scopes?.type, 'checkbox')
  assert.equal(scopes?.required, true)
  assert.equal(scopes?.default, 'read, write')
  assert.deepEqual(scopes?.options, ['read', 'write', 'admin'])
  assert.equal(form.fields.find((field) => field.name === 'agree')?.type, 'checkbox')
  assert.equal(form.fields.find((field) => field.name === 'agree')?.options, undefined)

  const checklist = plan.blocks.find((block) => block.type === 'checklist')
  assert.ok(checklist && checklist.type === 'checklist')
  assert.deepEqual(
    checklist.items.map((item) => item.done),
    [true, false],
  )
  assert.deepEqual(plan.interactionIds, ['access', 'scopes'])
  assert.equal(plan.interactionIds.includes('done-when'), false)

  const html = renderPlanStaticHtml(source)
  assert.match(html, /type="checkbox"[^>]*name="scopes"[^>]*value="admin"/)
  assert.match(html, /type="checkbox"[^>]*name="agree"[^>]*value="true"/)
  assert.doesNotMatch(html, /data-entry="checklist"[^]*type="checkbox"/)
})

test('a stepper and a checkbox list inside a row stay form interactions', () => {
  const source = `<Row>
<form id="prod-switch" prompt="Prod switch">
<field name="windows" label="Prod switch" type="checkbox" options="Window 1, Window 2" />
</form>
<form id="copies" prompt="Copies">
<field name="copies" label="Copies" type="stepper" default="2" min="1" max="8" step="1" />
</form>
</Row>
<form id="note" prompt="Note">
<field name="note" label="Note" type="text" />
<field name="flags" label="Flags" type="checkbox" options="a, b" />
</form>
<workflow id="forms" title="Forms">
\`\`\`workflow
prod-switch | Prod switch | prod-switch
--
prod-switch -> prod-switch
\`\`\`
</workflow>
`
  const plan = parsePlan(source)
  assert.deepEqual(plan.interactionIds, ['prod-switch', 'copies', 'note'])
  const copies = plan.entries?.find((entry) => entry.id === 'copies')
  assert.equal(copies?.type, 'form')
  const blocks = plan.blocks.filter((block) => block.type === 'form')
  const stepper = blocks.find((block) => block.type === 'form' && block.id === 'copies')
  assert.ok(stepper && stepper.type === 'form')
  assert.equal(stepper.fields[0]?.type, 'stepper')
  assert.equal(stepper.fields[0]?.default, 2)
  assert.equal(stepper.fields[0]?.min, 1)
  assert.equal(stepper.fields[0]?.max, 8)
  assert.equal(stepper.fields[0]?.step, 1)
  const html = renderPlanStaticHtml(source)
  assert.match(html, /data-field-type="stepper"/)
  assert.match(html, /aria-label="Increase"/)
  assert.match(html, /type="checkbox"[^>]*name="windows"/)
})
