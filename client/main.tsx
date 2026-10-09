import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { ExecutionCanvas } from './ExecutionCanvas'
import type { ExecutionState } from '../src/execution.ts'
import { createIdleExecutionState } from '../src/execution.ts'
import { getActiveExecutionCanvasAdapter } from './execution-canvas/registry.ts'
import './execution.css'

function ExecutionApp() {
  const [execution, setExecution] = useState<ExecutionState>(createIdleExecutionState())
  const adapter = getActiveExecutionCanvasAdapter()

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

  const hasCanvas = Boolean(execution.graph || execution.scene)

  return (
    <div className="execution-shell">
      <div className="execution-banner">
        <div>
          <div className="execution-kicker">
            {execution.active ? 'Live execution' : 'Execution idle'}
          </div>
          <h2>{execution.step ?? 'Waiting for the agent to start execution'}</h2>
          {execution.detail ? <p>{execution.detail}</p> : null}
        </div>
        <div className="execution-meta">
          <span>Canvas · {adapter.label}</span>
          <span>{execution.active ? 'Forms locked on Plan tab' : 'Plan interactions available'}</span>
          {execution.updatedAt ? (
            <span>Updated {new Date(execution.updatedAt).toLocaleTimeString()}</span>
          ) : null}
        </div>
      </div>
      <div className="execution-stage">
        {execution.active || hasCanvas ? (
          <ExecutionCanvas execution={execution} />
        ) : (
          <div className="execution-empty">
            The agent has not pushed an execution canvas yet. When execution starts, this
            tab shows a live {adapter.label} graph of the current run.
          </div>
        )}
      </div>
    </div>
  )
}

const root = document.getElementById('execution-root')
if (root) {
  createRoot(root).render(<ExecutionApp />)
}
