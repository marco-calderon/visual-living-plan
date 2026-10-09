import type { ExecutionGraph, ExecutionState } from '../src/execution.ts'
import graph from '../examples/execution-graph.json'

/** Shown on the Execution tab until the agent pushes a live graph. */
export const sampleLoopExecution: ExecutionState = {
  active: false,
  step: 'Retry loop',
  detail:
    'The implement step connects back to itself. React Flow draws that self-loop as the arc labeled retry.',
  graph: graph as ExecutionGraph,
}
