import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { renderPlanHtml } from '../src/markdoc/renderPlan.ts'
import { parsePlan } from '../src/parse.ts'
import { measurePlan } from '../src/planProgress.ts'
import { workflowRequirementError } from '../src/workflow.ts'

const emptyRender = { responses: {}, locked: false, diffs: [] }

test('existing YAML fences still render the rate-limit plan', () => {
  const source = readFileSync(new URL('../examples/rate-limit.plan.md', import.meta.url), 'utf8')
  const plan = parsePlan(source, 'examples/rate-limit.plan.md')
  const html = renderPlanHtml(plan, emptyRender)

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

  assert.match(html, /data-choice-id="fail-mode"/)
  assert.match(html, /data-form-id="limits"/)
  assert.match(html, /data-questions-id="rollout-notes"/)
  assert.match(html, /data-approve-id="proceed-implement"/)
  assert.match(html, /data-state-for="fail-mode"/)
  assert.match(html, /data-plan-part="phase:design\/title"/)
  assert.match(html, /data-plan-part="choice:fail-mode\/option:open"/)
  assert.equal(html.match(/data-plan-stamp=/g)?.length, plan.blocks.length)
})

test('a callout can contain a choice', () => {
  const plan = parsePlan(`{% callout id="redis" kind="risk" title="Redis dependency" %}
A Redis outage must not take down the API.

{% choice id="fail-mode" prompt="If Redis is unreachable, how should the limiter behave?" %}
{% option id="open" label="Fail open" %}Allow traffic.{% /option %}
{% option id="closed" label="Fail closed" %}
Reject traffic if Redis is down.
{% /option %}
{% /choice %}
{% /callout %}
`)
  const html = renderPlanHtml(plan, emptyRender)

  assert.equal(plan.blocks.length, 1)
  assert.equal(plan.blocks[0]?.type, 'callout')
  assert.equal(plan.blocks.some((block) => block.type === 'choice'), false)
  assert.deepEqual(plan.interactionIds, ['fail-mode'])
  assert.deepEqual(
    plan.entries?.map((entry) => entry.type),
    ['callout', 'choice'],
  )

  assert.match(html, /class="block callout kind-risk diff-unchanged"/)
  assert.match(html, /data-choice-id="fail-mode"/)
  assert.match(html, /data-option-id="open"/)
  assert.match(html, /data-plan-part="choice:fail-mode\/option:open"/)
  assert.match(html, /class="block interaction choice"/)
  assert.doesNotMatch(html, /class="block interaction choice[^"]*diff-/)
  assert.equal(html.match(/data-plan-stamp=/g)?.length, 1)
  assert.match(html, /Allow traffic/)
})

test('a callout composes a choice and an inline status chip', () => {
  const plan = parsePlan(`{% callout id="ship" kind="note" title="Rollout" %}
The limiter is {% status status="active" /%} at the gateway.

{% choice id="fail-mode" prompt="If Redis is unreachable?" %}
{% option id="open" label="Fail open" %}Allow traffic.{% /option %}
{% /choice %}
{% /callout %}
`)
  const html = renderPlanHtml(plan, emptyRender)

  assert.equal(plan.blocks.length, 1)
  assert.equal(plan.blocks[0]?.type, 'callout')
  assert.deepEqual(plan.interactionIds, ['fail-mode'])
  assert.equal(plan.entries?.some((entry) => entry.type === 'choice'), true)
  assert.match(html, /<span class="status-chip status-active">active<\/span>/)
  assert.match(html, /data-choice-id="fail-mode"/)
  assert.match(html, /data-interaction-id="fail-mode"/)
  assert.equal(html.match(/data-plan-stamp=/g)?.length, 1)
})
