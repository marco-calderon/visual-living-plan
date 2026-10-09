import type { ExecutionGraph, ExecutionState } from '../src/execution.ts'
import graph from '../examples/execution-graph.json'

/** Shown on the Execution tab until the agent pushes a live graph. */
export const sampleLoopExecution: ExecutionState = {
  active: false,
  step: 'Closed retry loop',
  detail:
    'Tests can drop into the Retry step. That card points back at Implement and closes the loop.',
  graph: graph as ExecutionGraph,
}
