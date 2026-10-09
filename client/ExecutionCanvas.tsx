import { useMemo } from 'react'
import type { ExecutionState } from '../src/execution.ts'
import { getActiveExecutionCanvasAdapter } from './execution-canvas/registry.ts'
import { executionToCanvasModel } from './execution-canvas/toCanvasModel.ts'

type Props = {
  execution: ExecutionState
  onSelectPlanRef?: (planRef: string) => void
}

/**
 * Host for the active execution-canvas adapter.
 * Keep this file free of library-specific imports so adapters stay swappable.
 */
export function ExecutionCanvas({ execution, onSelectPlanRef }: Props) {
  const adapter = useMemo(() => getActiveExecutionCanvasAdapter(), [])
  const model = useMemo(() => executionToCanvasModel(execution), [execution])

  if (!model || model.nodes.length === 0) {
    return (
      <div className="execution-empty">
        This plan has no phases or workflow yet. Add a workflow block, or phases
        the diagram can follow, to preview the execution plan here.
      </div>
    )
  }

  const { Component } = adapter
  return <Component model={model} readonly onSelectPlanRef={onSelectPlanRef} />
}
