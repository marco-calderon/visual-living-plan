import { useMemo } from 'react'
import type { ExecutionState } from '../src/execution.ts'
import { getActiveExecutionCanvasAdapter } from './execution-canvas/registry.ts'
import { executionToCanvasModel } from './execution-canvas/toCanvasModel.ts'

type Props = {
  execution: ExecutionState
}

/**
 * Host for the active execution-canvas adapter.
 * Keep this file free of library-specific imports so adapters stay swappable.
 */
export function ExecutionCanvas({ execution }: Props) {
  const adapter = useMemo(() => getActiveExecutionCanvasAdapter(), [])
  const model = useMemo(() => executionToCanvasModel(execution), [execution])

  if (!model || model.nodes.length === 0) {
    return (
      <div className="execution-empty">
        The agent has not pushed an execution graph yet. Send a portable `graph`
        payload to `/api/execution` to populate this canvas.
      </div>
    )
  }

  const { Component } = adapter
  return <Component model={model} readonly />
}
