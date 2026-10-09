import { createRoot } from 'react-dom/client'
import { useEffect, useMemo, useState } from 'react'
import { ExecutionCanvas } from './ExecutionCanvas'
import type { ExecutionState } from '../src/execution.ts'
import { createIdleExecutionState, mergePlannedExecution } from '../src/execution.ts'
import { getActiveExecutionCanvasAdapter } from './execution-canvas/registry.ts'
import { sampleLoopExecution } from './sampleLoopExecution.ts'
import './execution.css'

type FocusWindow = Window & {
  livingPlanFocusPlanRef?: (planRef: string) => void
}

function readBootstrap(): ExecutionState {
  const node = document.getElementById('living-plan-bootstrap')
  if (!node?.textContent) return createIdleExecutionState()
  try {
    return JSON.parse(node.textContent) as ExecutionState
  } catch {
    return createIdleExecutionState()
  }
}

function ExecutionApp() {
  const [execution, setExecution] = useState<ExecutionState>(readBootstrap)
  const adapter = getActiveExecutionCanvasAdapter()
  const plannedGraph = useMemo(
    () => mergePlannedExecution(execution.planned, execution.graph),
    [execution.graph, execution.planned],
  )
  const showingSample = !plannedGraph && !execution.scene
  const display = useMemo<ExecutionState>(
    () => (showingSample ? sampleLoopExecution : { ...execution, graph: plannedGraph }),
    [execution, plannedGraph, showingSample],
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      const response = await fetch('/api/execution')
      if (!response.ok) return
      const data = (await response.json()) as ExecutionState
      if (!cancelled) setExecution(data)
    }

    void load()

    const source = new EventSource('/api/events')
    source.addEventListener('execution', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as ExecutionState
        setExecution(payload)
      } catch {
        // ignore malformed events
      }
    })
    source.addEventListener('reload', () => {
      void load()
    })

    return () => {
      cancelled = true
      source.close()
    }
  }, [])

  function handleSelectPlanRef(planRef: string) {
    const focus = (window as FocusWindow).livingPlanFocusPlanRef
    focus?.(planRef)
  }

  const hasPlanSteps = Boolean(plannedGraph?.nodes.some((node) => node.planRef))
  const kicker = execution.active
    ? 'Live workflow'
    : showingSample
      ? 'Sample loop'
      : execution.graph
        ? 'Workflow'
        : 'Expected workflow'
  const heading = showingSample
    ? (sampleLoopExecution.step ?? 'Sample loop')
    : execution.active
      ? (execution.step ?? plannedGraph?.title ?? 'Workflow')
      : (execution.step ?? plannedGraph?.title ?? 'Workflow from the plan')
  const detail = showingSample
    ? sampleLoopExecution.detail
    : execution.active
      ? execution.detail
      : (execution.detail ?? 'This diagram is the execution plan, before the run is laid down.')

  return (
    <div className="execution-shell">
      <div className="execution-banner">
        <div>
          <div className="execution-kicker">{kicker}</div>
          <h2>{heading}</h2>
          {detail ? <p>{detail}</p> : null}
          {hasPlanSteps ? (
            <p className="execution-hint">Select a step to open the matching section in the plan.</p>
          ) : null}
        </div>
        <div className="execution-meta">
          <span>Canvas · {adapter.label}</span>
          <span>
            {showingSample
              ? 'Shown until this plan has a workflow'
              : execution.active
                ? 'Forms locked on Plan tab'
                : 'Plan interactions available'}
          </span>
          {execution.updatedAt ? (
            <span>Updated {new Date(execution.updatedAt).toLocaleTimeString()}</span>
          ) : null}
        </div>
      </div>
      <div className="execution-stage">
        <ExecutionCanvas execution={display} onSelectPlanRef={handleSelectPlanRef} />
      </div>
    </div>
  )
}

const root = document.getElementById('execution-root')
if (root) {
  createRoot(root).render(<ExecutionApp />)
}
