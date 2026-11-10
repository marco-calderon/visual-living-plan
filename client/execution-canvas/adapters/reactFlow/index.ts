import { lazy } from 'react'
import type { ExecutionCanvasAdapter } from '../../port.ts'

// React Flow and ELK are fetched when the Workflow tab first shows, not with the page.
const load = () => import('./ReactFlowExecutionCanvas.tsx')

export const reactFlowExecutionCanvasAdapter: ExecutionCanvasAdapter = {
  id: 'react-flow',
  label: 'React Flow',
  Component: lazy(() => load().then((module) => ({ default: module.ReactFlowExecutionCanvas }))),
  preload: () => {
    void load().catch(() => undefined)
  },
}
