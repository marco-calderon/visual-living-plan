import { BaseEdge, EdgeLabelRenderer, useStore, type Edge, type EdgeProps } from '@xyflow/react'
import {
  portPoint,
  routeWorkflowEdges,
  sideFromHandle,
  type PortSide,
  type RoutedEdgeInput,
  type RoutedNode,
  type WorkflowRoute,
} from './routeEdges.ts'

export type RoutedEdgeData = {
  label?: string
}

type RoutedEdgeType = Edge<RoutedEdgeData, 'routed'>

type MeasuredNode = {
  id: string
  measured?: { width?: number; height?: number }
  internals?: {
    positionAbsolute?: { x: number; y: number }
  }
}

type StoreEdge = {
  id: string
  source: string
  target: string
  type?: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

let routeCache: { key: string; routes: Map<string, WorkflowRoute> } | null = null

function routesFor(nodes: RoutedNode[], edges: RoutedEdgeInput[]): Map<string, WorkflowRoute> {
  const key = JSON.stringify({ nodes, edges })
  if (routeCache?.key === key) return routeCache.routes
  const routes = new Map(routeWorkflowEdges(nodes, edges).map((route) => [route.id, route]))
  routeCache = { key, routes }
  return routes
}

function geometryFrom(
  nodeLookup: Map<string, MeasuredNode>,
  edges: StoreEdge[],
): { nodes: RoutedNode[]; edges: RoutedEdgeInput[] } | null {
  const routed = edges.filter((edge) => edge.type === 'routed' && edge.source !== edge.target)
  if (routed.length === 0) return null

  const nodes: RoutedNode[] = []
  for (const node of nodeLookup.values()) {
    const origin = node.internals?.positionAbsolute
    const width = node.measured?.width
    const height = node.measured?.height
    if (!origin || !width || !height) return null
    nodes.push({ id: node.id, x: origin.x, y: origin.y, width, height })
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const inputs: RoutedEdgeInput[] = []
  for (const edge of routed) {
    const sourceBox = nodeById.get(edge.source)
    const targetBox = nodeById.get(edge.target)
    if (!sourceBox || !targetBox) return null
    const sourceSide = sideFromHandle(edge.sourceHandle, 'right')
    const targetSide = sideFromHandle(edge.targetHandle, 'left')
    inputs.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceSide,
      targetSide,
      sourcePoint: portPoint(sourceBox, sourceSide, 'source'),
      targetPoint: portPoint(targetBox, targetSide, 'target'),
    })
  }

  return { nodes, edges: inputs }
}

export function RoutedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  label,
  data,
}: EdgeProps<RoutedEdgeType>) {
  // nodeLookup is mutated in place and the store is notified with the same Map.
  // Read the boxes inside the selector so a later ELK placement recomputes the path.
  const route = useStore((state) => {
    const geometry = geometryFrom(state.nodeLookup as Map<string, MeasuredNode>, state.edges as StoreEdge[])
    if (!geometry) return undefined
    return routesFor(geometry.nodes, geometry.edges).get(id)
  }, sameRoute)

  const path =
    route?.path ||
    fallbackPath(sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition)
  const labelX = route?.labelX ?? (sourceX + targetX) / 2
  const labelY = route?.labelY ?? (sourceY + targetY) / 2
  const text = typeof label === 'string' || typeof label === 'number' ? label : data?.label

  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={style} interactionWidth={20} />
      {text ? (
        <EdgeLabelRenderer>
          <div
            className="rf-edge-label nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {text}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

function fallbackPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: EdgeProps['sourcePosition'],
  targetPosition: EdgeProps['targetPosition'],
): string {
  const sourceSide = positionSide(sourcePosition)
  const targetSide = positionSide(targetPosition)
  const [route] = routeWorkflowEdges(
    [],
    [
      {
        id: 'fallback',
        source: 's',
        target: 't',
        sourceSide,
        targetSide,
        sourcePoint: { x: sourceX, y: sourceY },
        targetPoint: { x: targetX, y: targetY },
      },
    ],
  )
  return route?.path || `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`
}

function sameRoute(previous: WorkflowRoute | undefined, next: WorkflowRoute | undefined): boolean {
  return previous?.path === next?.path && previous?.labelX === next?.labelX && previous?.labelY === next?.labelY
}

function positionSide(position: EdgeProps['sourcePosition']): PortSide {
  if (position === 'top' || position === 'right' || position === 'bottom' || position === 'left') return position
  return 'right'
}
