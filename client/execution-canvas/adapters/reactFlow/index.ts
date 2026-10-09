import type { ExecutionCanvasAdapter } from '../../port.ts'
import { ReactFlowExecutionCanvas } from './ReactFlowExecutionCanvas.tsx'

export const reactFlowExecutionCanvasAdapter: ExecutionCanvasAdapter = {
  id: 'react-flow',
  label: 'React Flow',
  Component: ReactFlowExecutionCanvas,
}
