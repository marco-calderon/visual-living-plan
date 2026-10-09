import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { ExecutionNodeStatus } from '../../../../src/execution.ts'
import { ProgressIcon } from './ProgressIcon.tsx'

export type ExecutionStepNodeData = {
  label: string
  detail?: string
  status: ExecutionNodeStatus
}

export type ExecutionStepNodeType = Node<ExecutionStepNodeData, 'executionStep'>

function ExecutionStepNodeComponent({ data }: NodeProps<ExecutionStepNodeType>) {
  return (
    <div className={`rf-step status-${data.status}`}>
      <Handle type="target" position={Position.Left} className="rf-handle" />
      <div className="rf-step-status">
        {data.status === 'active' ? <ProgressIcon /> : null}
        {data.status}
      </div>
      <div className="rf-step-label">{data.label}</div>
      {data.detail ? <div className="rf-step-detail">{data.detail}</div> : null}
      <Handle type="source" position={Position.Right} className="rf-handle" />
    </div>
  )
}

export const ExecutionStepNode = memo(ExecutionStepNodeComponent)
