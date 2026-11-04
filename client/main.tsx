import { useQuery } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { registerServiceWorker } from '../src/registerServiceWorker.ts'
import { startOfflineEngine } from './offline/engine.ts'
import { useEffect, useMemo, useState } from 'react'
import { ExecutionCanvas } from './ExecutionCanvas'
import type { ExecutionState } from '../src/execution.ts'
import { createIdleExecutionState, mergePlannedExecution } from '../src/execution.ts'
import { subscribePlanEvents } from './planEvents.ts'
import { startPlanStatusMark } from './planStatusMark.ts'
import { sampleLoopExecution } from './sampleLoopExecution.ts'
import { QueryProvider, sharedQueryClient } from './queryClient.tsx'
import { viewingPlanVersion } from './versionView.ts'
import './execution.css'

type FocusWindow = Window & {
  livingPlanFocusPlanRef?: (planRef: string) => void
}

type PlanWindow = Window & {
  __LIVE_PLAN_BASE__?: string
}

function apiPath(path: string): string {
  const base = (window as PlanWindow).__LIVE_PLAN_BASE__ ?? ''
  return `${base}${path}`
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

async function readExecution(): Promise<ExecutionState> {
  const response = await fetch(apiPath('/api/execution'))
  if (!response.ok) throw new Error('Request failed')
  return (await response.json()) as ExecutionState
}

function ExecutionApp() {
  const [bootstrap] = useState<ExecutionState>(readBootstrap)
  // The page's embedded state shows first. The event stream keeps it current, so there is no polling.
  const query = useQuery({
    queryKey: ['execution', apiPath('')],
    queryFn: readExecution,
    initialData: bootstrap,
    initialDataUpdatedAt: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  const execution = query.data
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
    // A saved version shows the workflow from its own source, not the live run.
    if (viewingPlanVersion() !== null) return
    const client = sharedQueryClient()
    const key = ['execution', apiPath('')]
    // initialDataUpdatedAt 0 marks the embedded state stale, so this reads the server once.
    void client.refetchQueries({ queryKey: key, exact: true })

    const stopExecution = subscribePlanEvents('execution', (event) => {
      try {
        client.setQueryData(key, JSON.parse(event.data) as ExecutionState)
      } catch {
        // ignore malformed events
      }
    })
    const stopReload = subscribePlanEvents('reload', () => {
      void client.invalidateQueries({ queryKey: key, exact: true })
    })

    return () => {
      stopExecution()
      stopReload()
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
          <div className="execution-kicker" role="status">{kicker}</div>
          <h2>{heading}</h2>
          {detail ? <p>{detail}</p> : null}
          {hasPlanSteps ? (
            <p className="execution-hint">Select a step to open the matching section in the plan.</p>
          ) : null}
        </div>
        <div className="execution-meta">
          {showingSample ? (
            <span>Shown until this plan has a workflow</span>
          ) : execution.active ? (
            <span>Forms locked on Plan tab</span>
          ) : null}
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

if (typeof document !== 'undefined') {
  registerServiceWorker()
  void startOfflineEngine()
  startPlanStatusMark()
  const root = document.getElementById('execution-root')
  if (root) createRoot(root).render(
      <QueryProvider>
        <ExecutionApp />
      </QueryProvider>,
    )
}
