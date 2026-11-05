import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { mergePlannedExecution } from '../src/execution.ts'
import { buildExpectedGraph } from '../src/expectedWorkflow.ts'
import { parsePlan } from '../src/parse.ts'
import { measurePlan } from '../src/planProgress.ts'

const fixture = readFileSync(new URL('../examples/rate-limit.plan.md', import.meta.url), 'utf8')

function statuses(answered: string[] = []): Record<string, string | undefined> {
  const graph = buildExpectedGraph(parsePlan(fixture, 'rate-limit.plan.md', 'rate-limit'), undefined, answered)
  return Object.fromEntries((graph?.nodes ?? []).map((node) => [node.id, node.status]))
}

test('workflow steps follow phase status from the plan', () => {
  const steps = statuses()
  assert.equal(steps.design, 'done')
  assert.equal(steps.implement, 'active')
  assert.equal(steps['fail-mode'], 'pending')
})

test('an answered interaction marks its workflow step done', () => {
  const steps = statuses(['fail-mode', 'limits'])
  assert.equal(steps['fail-mode'], 'done')
  assert.equal(steps.limits, 'done')
  assert.equal(steps['rollout-notes'], 'pending')
})

test('a live run does not move a plan step backwards, matching progress', () => {
  const plan = parsePlan(fixture, 'rate-limit.plan.md', 'rate-limit')
  const live = { nodes: [{ id: 'design', label: 'Design', status: 'active' as const }, { id: 'observe', label: 'Observe', status: 'active' as const }] }
  const merged = mergePlannedExecution(buildExpectedGraph(plan), live)
  const byId = new Map(merged?.nodes.map((node) => [node.id, node.status]))
  assert.equal(byId.get('design'), 'done')
  assert.equal(byId.get('observe'), 'active')
  const progress = measurePlan(plan, [], { active: true, graph: live })
  assert.equal(progress.phaseDone, 1)
})

test('a step with no plan link takes the live status', () => {
  const merged = mergePlannedExecution(
    { nodes: [{ id: 'a', label: 'A', status: 'done' }] },
    { nodes: [{ id: 'a', label: 'A', status: 'failed' }] },
  )
  assert.equal(merged?.nodes[0]?.status, 'failed')
})
