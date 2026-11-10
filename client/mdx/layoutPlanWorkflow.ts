import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkExtendedEdge, ElkNode } from 'elkjs'
import {
  portPoint,
  routeWorkflowEdges,
  type Point,
  type PortSide,
  type RoutedNode,
} from '../execution-canvas/adapters/reactFlow/routeEdges.ts'
import {
  estimateWorkflowNodeSize,
  roundLayout,
  WORKFLOW_ELK_OPTIONS,
} from '../../src/workflowLayoutShared.ts'
import { parseWorkflowSource } from '../../src/workflowSource.ts'

type ElkFakeWorker = {
  dispatcher: { saveDispatch: (event: { data: unknown }) => void }
  onmessage: ((event: { data: unknown }) => void) | null
}

const elk = new ELK()
await elk.knownLayoutAlgorithms()

function elkFakeWorker(): ElkFakeWorker {
  return (elk as unknown as { worker: { worker: ElkFakeWorker } }).worker.worker
}

/**
 * Same synchronous ELK pass the plan canvas uses: layered, left to right,
 * orthogonal routing. A fresh graph is built per call.
 */
function layoutElkGraph(graph: ElkNode): ElkNode {
  const worker = elkFakeWorker()
  let data: ElkNode | undefined
  let errorMessage: string | undefined
  const previous = worker.onmessage
  worker.onmessage = (event) => {
    const payload = event.data as { data?: ElkNode; error?: { message?: string } }
    data = payload.data
    errorMessage = payload.error?.message
  }
  try {
    worker.dispatcher.saveDispatch({
      data: {
        id: 1,
        cmd: 'layout',
        graph,
        layoutOptions: {},
        options: { logging: false, measureExecutionTime: false },
      },
    })
  } finally {
    worker.onmessage = previous
  }
  if (errorMessage) throw new Error(errorMessage)
  if (!data) throw new Error('ELK layout produced no graph')
  return data
}

export type PlanWorkflowNode = {
  id: string
  label: string
  detail?: string
  planRef?: string
  planLabel?: string
}

export type PlanWorkflowEdge = {
  from: string
  to: string
  label?: string
  fromSide?: PortSide
  toSide?: PortSide
}

export type PlacedWorkflowNode = PlanWorkflowNode & {
  x: number
  y: number
  width: number
  height: number
}

export type DrawnWorkflowEdge = {
  id: string
  path: string
  points: Point[]
  label?: string
  labelX: number
  labelY: number
  loop: boolean
}

export type PlanWorkflowLayout = {
  width: number
  height: number
  minX: number
  minY: number
  nodes: PlacedWorkflowNode[]
  edges: DrawnWorkflowEdge[]
}

export function parseWorkflowDocument(source: string): {
  nodes: PlanWorkflowNode[]
  edges: PlanWorkflowEdge[]
} {
  const parsed = parseWorkflowSource(source)
  return {
    nodes: parsed.nodes.map(({ ref, ...node }) => (ref ? { ...node, planRef: ref } : node)),
    edges: parsed.edges,
  }
}

/** Place steps with the plan's ELK options, then draw edges on separate rails. */
export function layoutPlanWorkflow(
  nodes: readonly PlanWorkflowNode[],
  edges: readonly PlanWorkflowEdge[],
): PlanWorkflowLayout {
  if (nodes.length === 0) {
    return { width: 0, height: 0, minX: 0, minY: 0, nodes: [], edges: [] }
  }

  const placed = placeNodes(nodes, edges)
  const routed = placed.map((node) => ({
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }))
  const nodeById = new Map(routed.map((node) => [node.id, node]))
  const forward: Array<{ input: Parameters<typeof routeWorkflowEdges>[1][number]; label?: string }> = []
  const loops: Array<{ edge: PlanWorkflowEdge; index: number }> = []

  edges.forEach((edge, index) => {
    if (edge.from === edge.to) {
      loops.push({ edge, index })
      return
    }
    const source = nodeById.get(edge.from)
    const target = nodeById.get(edge.to)
    if (!source || !target) return
    const sourceSide = edge.fromSide ?? 'right'
    const targetSide = edge.toSide ?? 'left'
    forward.push({
      label: edge.label,
      input: {
        id: `e${index}`,
        source: edge.from,
        target: edge.to,
        sourceSide,
        targetSide,
        sourcePoint: portPoint(source, sourceSide, 'source'),
        targetPoint: portPoint(target, targetSide, 'target'),
      },
    })
  })

  const routes = new Map(
    routeWorkflowEdges(
      routed,
      forward.map((edge) => edge.input),
    ).map((route) => [route.id, route]),
  )

  const drawn: DrawnWorkflowEdge[] = forward.map((edge) => {
    const route = routes.get(edge.input.id)
    return {
      id: edge.input.id,
      path: route?.path ?? '',
      points: route?.points ?? [],
      ...(edge.label ? { label: edge.label } : {}),
      labelX: route?.labelX ?? 0,
      labelY: route?.labelY ?? 0,
      loop: false,
    }
  })

  for (const { edge, index } of loops) {
    const node = nodeById.get(edge.from)
    if (!node) continue
    const loop = loopGeometry(node)
    drawn.push({
      id: `loop${index}`,
      path: loop.path,
      points: loop.points,
      ...(edge.label ? { label: edge.label } : {}),
      labelX: loop.labelX,
      labelY: loop.labelY,
      loop: true,
    })
  }

  const bounds = boundsOf(placed, drawn)
  return {
    ...bounds,
    nodes: placed,
    edges: drawn,
  }
}

function placeNodes(
  nodes: readonly PlanWorkflowNode[],
  edges: readonly PlanWorkflowEdge[],
): PlacedWorkflowNode[] {
  const sizeById = new Map<string, { width: number; height: number }>()
  const children: ElkNode[] = []
  for (const node of nodes) {
    const size = estimateWorkflowNodeSize(node)
    sizeById.set(node.id, size)
    children.push({ id: node.id, width: size.width, height: size.height })
  }

  const elkEdges: ElkExtendedEdge[] = []
  edges.forEach((edge, index) => {
    if (edge.from === edge.to) return
    if (!sizeById.has(edge.from) || !sizeById.has(edge.to)) return
    elkEdges.push({
      id: `e${index}`,
      sources: [edge.from],
      targets: [edge.to],
    })
  })

  const laidOut = layoutElkGraph({
    id: 'root',
    layoutOptions: WORKFLOW_ELK_OPTIONS,
    children,
    edges: elkEdges,
  })
  const placedById = new Map((laidOut.children ?? []).map((child) => [child.id, child]))

  return nodes.map((node) => {
    const placed = placedById.get(node.id)
    const size = sizeById.get(node.id) ?? estimateWorkflowNodeSize(node)
    return {
      ...node,
      x: placed && typeof placed.x === 'number' ? roundLayout(placed.x) : 0,
      y: placed && typeof placed.y === 'number' ? roundLayout(placed.y) : 0,
      width: size.width,
      height: size.height,
    }
  })
}

function loopGeometry(node: RoutedNode): { path: string; labelX: number; labelY: number; points: Point[] } {
  const source = portPoint(node, 'right', 'source')
  const target = portPoint(node, 'left', 'target')
  const lift = 96
  const out = 36
  const topY = Math.min(source.y, target.y) - lift
  const labelX = (source.x + target.x) / 2
  const points = [
    source,
    { x: source.x + out, y: source.y },
    { x: source.x + out, y: topY },
    { x: labelX, y: topY },
    { x: target.x - out, y: topY },
    { x: target.x - out, y: target.y },
    target,
  ]
  const path = [
    `M ${source.x} ${source.y}`,
    `C ${source.x + out} ${source.y}, ${source.x + out} ${topY}, ${labelX} ${topY}`,
    `C ${target.x - out} ${topY}, ${target.x - out} ${target.y}, ${target.x} ${target.y}`,
  ].join(' ')
  return { path, labelX, labelY: topY, points }
}

function boundsOf(
  nodes: readonly PlacedWorkflowNode[],
  edges: readonly DrawnWorkflowEdge[],
): { minX: number; minY: number; width: number; height: number } {
  let minX = 0
  let minY = 0
  let maxX = 0
  let maxY = 0
  const include = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  for (const node of nodes) {
    include(node.x, node.y)
    include(node.x + node.width, node.y + node.height)
  }
  for (const edge of edges) {
    for (const point of edge.points) include(point.x, point.y)
  }
  const pad = 28
  minX -= pad
  minY -= pad
  maxX += pad
  maxY += pad
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}
