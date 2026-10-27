import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkExtendedEdge, ElkNode } from 'elkjs'
import {
  estimateWorkflowNodeSize,
  roundLayout,
  WORKFLOW_ELK_OPTIONS,
  type WorkflowLayoutEdge,
  type WorkflowLayoutNode,
  type WorkflowNodeSize,
} from '../src/workflowLayoutShared.ts'

type ElkFakeWorker = {
  dispatcher: { saveDispatch: (event: { data: unknown }) => void }
  onmessage: ((event: { data: unknown }) => void) | null
}

const elk = new ELK()
await elk.knownLayoutAlgorithms()

function elkFakeWorker(): ElkFakeWorker {
  return (elk as unknown as { worker: { worker: ElkFakeWorker } }).worker.worker
}

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

/** Browser ELK layout for the React Flow canvas. */
export function layoutWorkflowNodes<T extends WorkflowLayoutNode>(
  nodes: T[],
  edges: WorkflowLayoutEdge[],
  sizes?: ReadonlyMap<string, WorkflowNodeSize>,
): Array<T & { x: number; y: number }> {
  if (nodes.length === 0) return []

  const sizeById = new Map<string, WorkflowNodeSize>()
  const children: ElkNode[] = []
  for (const node of nodes) {
    const measured = sizes?.get(node.id)
    const size = {
      width: measured && measured.width > 0 ? measured.width : estimateWorkflowNodeSize(node).width,
      height: measured && measured.height > 0 ? measured.height : estimateWorkflowNodeSize(node).height,
    }
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
    const size = sizeById.get(node.id)
    if (!placed || typeof placed.x !== 'number' || typeof placed.y !== 'number' || !size) {
      return { ...node, x: node.x ?? 0, y: node.y ?? 0 }
    }
    return {
      ...node,
      x: roundLayout(placed.x),
      y: roundLayout(placed.y),
    }
  })
}
