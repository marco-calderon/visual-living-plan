import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWorkflowDocument } from '../client/mdx/layoutPlanWorkflow.ts'
import { parsePlan } from '../src/parse.ts'
import { wireNewSteps } from '../src/planMdx/editSource.ts'
import { planToExpectedGraph, workflowRequirementError } from '../src/workflow.ts'
import { parseWorkflowSource } from '../src/workflowSource.ts'

function planWith(body: string): string {
  return [
    '<phase id="design" title="Design">',
    'x',
    '</phase>',
    '',
    '<phase id="build" title="Build">',
    'y',
    '</phase>',
    '',
    '<workflow id="path" title="Path">',
    '```workflow',
    body,
    '```',
    '</workflow>',
    '',
  ].join('\n')
}

function steps(source: string): string[] {
  return (planToExpectedGraph(parsePlan(source))?.nodes ?? []).map((node) => `${node.id}:${node.label}`)
}

test('a column header row in the workflow is not a step', () => {
  const source = planWith('id | label | ref | detail\ndesign | Design | design\nbuild | Build | build\n--\ndesign -> build')
  assert.deepEqual(steps(source), ['design:Design', 'build:Build'])
})

test('a markdown table with outer pipes and a separator row reads as steps', () => {
  const source = planWith(
    [
      '| id | label | ref | detail |',
      '|---|---|---|---|',
      '| design | Design | design | |',
      '| build | Build | build | Editing build.ts |',
      '--',
      'design -> build',
    ].join('\n'),
  )
  assert.equal(workflowRequirementError(parsePlan(source)), undefined)
  assert.deepEqual(steps(source), ['design:Design', 'build:Build'])
  const graph = planToExpectedGraph(parsePlan(source))
  assert.equal(graph?.nodes[1]?.detail, 'Editing build.ts')
})

test('a separator row without outer pipes is not a step', () => {
  const source = planWith('id | label | ref\n--- | :---: | ---\ndesign | Design | design\n--\ndesign -> build')
  assert.deepEqual(steps(source), ['design:Design'])
})

test('a workflow with only a header row has no steps', () => {
  const plan = parsePlan(planWith('id | label | ref | detail\n--\n'))
  assert.match(workflowRequirementError(plan) ?? '', /requires a workflow block/)
})

test('a from -> to header is not an edge', () => {
  const parsed = parseWorkflowSource('a | A\nb | B\n--\nfrom -> to\na -> b | next')
  assert.deepEqual(parsed.edges, [{ from: 'a', to: 'b', label: 'next' }])
  // Steps named from and to keep their edge.
  const named = parseWorkflowSource('from | From\nto | To\n--\nfrom -> to')
  assert.deepEqual(named.edges, [{ from: 'from', to: 'to' }])
})

test('the in-page diagram reads the same steps as the server', () => {
  const parsed = parseWorkflowDocument('id | label | ref | detail\n|---|---|\n| design | Design | design | Notes |\n--\ndesign -> design @ right>right | retry')
  assert.deepEqual(parsed.nodes, [{ id: 'design', label: 'Design', planRef: 'design', detail: 'Notes' }])
  assert.deepEqual(parsed.edges, [{ from: 'design', to: 'design', label: 'retry', fromSide: 'right', toSide: 'right' }])
})

test('a new first card goes after the header row, not above it', () => {
  const body = [
    '<workflow id="w">',
    '```workflow',
    'id | label | ref',
    'b | B | b',
    '--',
    '```',
    '</workflow>',
    '',
    '<phase id="new" title="New step">',
    'x',
    '</phase>',
    '',
    '<phase id="b" title="B">',
    'y',
    '</phase>',
    '',
  ].join('\n')
  const wired = wireNewSteps(body, new Set(['b']))
  assert.match(wired, /```workflow\nid \| label \| ref\nnew \| New step \| new\nb \| B \| b\n--\nnew -> b\n```/)
})
