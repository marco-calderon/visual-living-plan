import { createContext, memo, useContext } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { ExecutionNodeStatus } from '../../../../src/execution.ts'
import { planRefHash } from '../../../../src/planRefNavigation.ts'
import { ProgressIcon } from './ProgressIcon.tsx'

export type ExecutionStepNodeData = {
  label: string
  detail?: string
  status: ExecutionNodeStatus
  planRef?: string
  planLabel?: string
}

export type ExecutionStepNodeType = Node<ExecutionStepNodeData, 'executionStep'>

export const PlanRefContext = createContext<(planRef: string) => void>(() => {})

const ports: Array<{
  id: string
  type: 'source' | 'target'
  position: Position
}> = [
  { id: 'in-left', type: 'target', position: Position.Left },
  { id: 'out-right', type: 'source', position: Position.Right },
  { id: 'in-top', type: 'target', position: Position.Top },
  { id: 'out-top', type: 'source', position: Position.Top },
  { id: 'out-bottom', type: 'source', position: Position.Bottom },
  { id: 'in-bottom', type: 'target', position: Position.Bottom },
  { id: 'out-left', type: 'source', position: Position.Left },
  { id: 'in-right', type: 'target', position: Position.Right },
]

function ExecutionStepNodeComponent({ data }: NodeProps<ExecutionStepNodeType>) {
  const openPlanRef = useContext(PlanRefContext)
  const planReference = data.planLabel ?? data.planRef

  return (
    <div className={`rf-step status-${data.status}${data.planRef ? ' is-linked' : ''}`}>
      {ports.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          type={port.type}
          position={port.position}
          className="rf-handle"
        />
      ))}
      <div className="rf-step-status">
        {data.status === 'active' ? <ProgressIcon /> : null}
        {data.status}
      </div>
      {data.planRef ? (
        <a
          className="rf-step-label"
          href={planRefHash(data.planRef)}
          draggable={false}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
        >
          {data.label}
        </a>
      ) : (
        <div className="rf-step-label">{data.label}</div>
      )}
      {data.detail ? <div className="rf-step-detail">{data.detail}</div> : null}
      {data.planRef && planReference ? (
        <button
          type="button"
          className="rf-step-ref"
          onClick={(event) => {
            event.stopPropagation()
            openPlanRef(data.planRef ?? '')
          }}
        >
          Plan · {planReference}
        </button>
      ) : null}
    </div>
  )
}

export const ExecutionStepNode = memo(ExecutionStepNodeComponent)
