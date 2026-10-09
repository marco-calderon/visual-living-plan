import type { ExecutionCanvasAdapter } from './port.ts'
import { reactFlowExecutionCanvasAdapter } from './adapters/reactFlow/index.ts'

/**
 * Registered execution-canvas adapters.
 * To swap libraries later:
 * 1. Add `adapters/<name>/` implementing `ExecutionCanvasAdapter`
 * 2. Register it here
 * 3. Change `ACTIVE_EXECUTION_CANVAS_ADAPTER_ID`
 */
export const executionCanvasAdapters: ExecutionCanvasAdapter[] = [
  reactFlowExecutionCanvasAdapter,
]

/** Active visualizer for the Workflow tab. */
export const ACTIVE_EXECUTION_CANVAS_ADAPTER_ID = 'react-flow'

export function getActiveExecutionCanvasAdapter(): ExecutionCanvasAdapter {
  const active =
    executionCanvasAdapters.find((adapter) => adapter.id === ACTIVE_EXECUTION_CANVAS_ADAPTER_ID) ??
    executionCanvasAdapters[0]

  if (!active) {
    throw new Error('No execution canvas adapter registered')
  }

  return active
}
