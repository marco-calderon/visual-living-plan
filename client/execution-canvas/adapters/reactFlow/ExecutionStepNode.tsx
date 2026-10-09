import { memo, type CSSProperties } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { ExecutionNodeStatus } from '../../../../src/execution.ts'
import { ProgressIcon } from './ProgressIcon.tsx'

export type ExecutionStepNodeData = {
  label: string
  detail?: string
  status: ExecutionNodeStatus
}

export type ExecutionStepNodeType = Node<ExecutionStepNodeData, 'executionStep'>

const ports: Array<{
  id: string
  type: 'source' | 'target'
  position: Position
  style?: CSSProperties
}> = [
  { id: 'in-left', type: 'target', position: Position.Left },
  { id: 'out-right', type: 'source', position: Position.Right },
  { id: 'in-top', type: 'target', position: Position.Top },
  { id: 'out-top', type: 'source', position: Position.Top, style: { left: '78%' } },
  { id: 'out-bottom', type: 'source', position: Position.Bottom, style: { left: '22%' } },
  { id: 'in-bottom', type: 'target', position: Position.Bottom, style: { left: '78%' } },
  { id: 'out-left', type: 'source', position: Position.Left, style: { top: '78%' } },
  { id: 'in-right', type: 'target', position: Position.Right, style: { top: '78%' } },
]

function ExecutionStepNodeComponent({ data }: NodeProps<ExecutionStepNodeType>) {
  return (
    <div className={`rf-step status-${data.status}`}>
      {ports.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          type={port.type}
          position={port.position}
          className="rf-handle"
          style={port.style}
        />
      ))}
      <div className="rf-step-status">
        {data.status === 'active' ? <ProgressIcon /> : null}
        {data.status}
      </div>
      <div className="rf-step-label">{data.label}</div>
      {data.detail ? <div className="rf-step-detail">{data.detail}</div> : null}
    </div>
  )
}

export const ExecutionStepNode = memo(ExecutionStepNodeComponent)
