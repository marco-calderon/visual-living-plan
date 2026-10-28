import type { ReactNode } from 'react'
import { Box } from './Box'
import { anchorId, keyedEntries, partitionEntries } from './planEntry'
import { cx } from './styles'
import type { WorkflowEdgeSpec, WorkflowNodeSpec } from './types'
import { VStack } from './VStack'
import { WorkflowStep } from './WorkflowStep'

export type WorkflowProps = {
  id: string
  title?: string
  nodes?: WorkflowNodeSpec[]
  edges?: WorkflowEdgeSpec[]
  children?: ReactNode
  className?: string
  onOpenDiagram?: () => void
}

function edgeLabel(edge: WorkflowEdgeSpec): string {
  const from = edge.fromSide ? `${edge.from} (${edge.fromSide})` : edge.from
  const to = edge.toSide ? `${edge.to} (${edge.toSide})` : edge.to
  return edge.label ? `${from} → ${to} (${edge.label})` : `${from} → ${to}`
}

export function Workflow({
  id,
  title = 'Execution plan',
  nodes,
  edges,
  children,
  className,
  onOpenDiagram,
}: WorkflowProps) {
  const { matches, rest } = partitionEntries(children, 'step')
  return (
    <Box
      as="section"
      surface="panel"
      className={cx('plan-entry', 'plan-workflow', className)}
      id={anchorId(id)}
      data-entry="workflow"
      data-entry-id={id}
    >
      <VStack gap="sm">
        <span className="plan-kicker">Expected workflow</span>
        <h3 className="plan-title">{title}</h3>
        <p className="plan-note">
          These steps are the execution plan before the run is laid down. The workflow diagram draws the same path.
          Select a step to jump to the matching place in this plan.
        </p>
        <VStack as="ol" gap="xs" className="plan-workflow-steps">
          {nodes?.map((node) => (
            <WorkflowStep
              key={node.id}
              id={node.id}
              label={node.label ?? node.id}
              planRef={node.ref ?? node.id}
              detail={node.detail}
              status={node.status}
            />
          ))}
          {keyedEntries(matches, 'step')}
        </VStack>
        {rest}
        {edges && edges.length > 0 ? (
          <VStack as="ul" gap="xs" className="plan-workflow-edges">
            {edges.map((edge, index) => (
              <li key={`${edge.from}-${edge.to}-${index}`}>{edgeLabel(edge)}</li>
            ))}
          </VStack>
        ) : null}
        <div>
          <button type="button" className="plan-btn" data-entry-action="open-workflow" onClick={onOpenDiagram}>
            Open workflow diagram
          </button>
        </div>
      </VStack>
    </Box>
  )
}
