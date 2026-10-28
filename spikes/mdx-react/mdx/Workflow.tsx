import { useMemo, type ReactNode } from 'react'
import {
  layoutPlanWorkflow,
  parseWorkflowDocument,
  type PlanWorkflowEdge,
  type PlanWorkflowNode,
  type PlacedWorkflowNode,
} from './layoutPlanWorkflow.ts'
import { collectText } from './textChildren.ts'

type WorkflowProps = {
  id?: string
  title?: string
  nodes?: readonly PlanWorkflowNode[]
  edges?: readonly PlanWorkflowEdge[]
  children?: ReactNode
}

export function Workflow({ id, title = 'Expected execution', nodes, edges, children }: WorkflowProps) {
  const source = collectText(children)
  const layout = useMemo(() => {
    const spec = nodes && nodes.length > 0 ? { nodes: [...nodes], edges: [...(edges ?? [])] } : parseWorkflowDocument(source)
    return layoutPlanWorkflow(spec.nodes, spec.edges)
  }, [edges, nodes, source])

  return (
    <section id={id} className="vlp-workflow plan-panel" aria-label={title}>
      <h3 className="plan-title">{title}</h3>
      {layout.nodes.length === 0 ? <p>Workflow has no steps.</p> : null}
      {layout.nodes.length > 0 ? (
        <svg
          role="img"
          aria-label={title}
          viewBox={`${layout.minX} ${layout.minY} ${layout.width} ${layout.height}`}
        >
          <defs>
            <marker id={`${id || 'workflow'}-arrow`} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path className="vlp-workflow-arrow" d="M0,0 L7,3 L0,6 Z" />
            </marker>
            <marker id={`${id || 'workflow'}-loop`} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path className="vlp-workflow-arrow is-loop" d="M0,0 L7,3 L0,6 Z" />
            </marker>
          </defs>
          {layout.edges.map((edge) => (
            <g key={edge.id}>
              <path
                className={edge.loop ? 'vlp-workflow-edge is-loop' : 'vlp-workflow-edge'}
                d={edge.path}
                strokeWidth={edge.loop ? 1.75 : 1.4}
                markerEnd={`url(#${id || 'workflow'}-${edge.loop ? 'loop' : 'arrow'})`}
              />
              {edge.label ? (
                <text className="vlp-workflow-edge-label" x={edge.labelX} y={edge.labelY - 6} textAnchor="middle" fontSize="12">
                  {edge.label}
                </text>
              ) : null}
            </g>
          ))}
          {layout.nodes.map((node) => (
            <WorkflowCard key={node.id} node={node} />
          ))}
        </svg>
      ) : null}
    </section>
  )
}

function WorkflowCard({ node }: { node: PlacedWorkflowNode }) {
  const labelLines = wrap(node.label, 22)
  const detailLines = node.detail ? wrap(node.detail, 28) : []
  const reference = node.planLabel ?? node.planRef
  let cursor = 22
  return (
    <a href={node.planRef ? `#${node.planRef}` : undefined}>
      <g>
        <rect
          className="vlp-workflow-card"
          x={node.x}
          y={node.y}
          width={node.width}
          height={node.height}
          rx="12"
        />
        <text className="vlp-workflow-label" x={node.x + 16} y={node.y + cursor} fontSize="15" fontWeight="600">
          {labelLines.map((line) => {
            const y = cursor
            cursor += 22
            return (
              <tspan key={`${node.id}-label-${y}`} x={node.x + 16} y={node.y + y}>
                {line}
              </tspan>
            )
          })}
        </text>
        {detailLines.length > 0 ? (
          <text className="vlp-workflow-detail" x={node.x + 16} y={node.y + (cursor += 8)} fontSize="13">
            {detailLines.map((line) => {
              const y = cursor
              cursor += 20
              return (
                <tspan key={`${node.id}-detail-${y}`} x={node.x + 16} y={node.y + y}>
                  {line}
                </tspan>
              )
            })}
          </text>
        ) : null}
        {reference ? (
          <text className="vlp-workflow-ref" x={node.x + 16} y={node.y + cursor + 18} fontSize="12">
            {`Plan · ${reference}`}
          </text>
        ) : null}
      </g>
    </a>
  )
}

function wrap(text: string, size: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > size && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines.length > 0 ? lines : ['']
}
