import type { ComponentType } from 'react'
import type { ExecutionCanvasProps } from './types.ts'

/**
 * Swap point for execution visualizers.
 * Add a new adapter under `adapters/`, register it in `registry.ts`,
 * and set `ACTIVE_EXECUTION_CANVAS_ADAPTER` there.
 */
export type ExecutionCanvasAdapter = {
  id: string
  label: string
  Component: ComponentType<ExecutionCanvasProps>
}
