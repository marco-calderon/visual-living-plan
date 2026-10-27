export type WorkflowLayoutNode = {
  id: string
  label: string
  detail?: string
  planRef?: string
  planLabel?: string
  x?: number
  y?: number
}

export type WorkflowLayoutEdge = {
  from: string
  to: string
}

export type WorkflowNodeSize = {
  width: number
  height: number
}

/**
 * Cards are at most 240px wide. Layer spacing is the horizontal gutter between
 * ranks. The edge router needs that gutter wider than a smooth-step corner, and
 * wide enough that fan-in rails can sit side by side.
 */
const CARD_WIDTH = 240

export function estimateWorkflowNodeSize(node: {
  label: string
  detail?: string
  planRef?: string
  planLabel?: string
}): WorkflowNodeSize {
  const labelLines = Math.max(1, Math.ceil(node.label.length / 22))
  const detailLines = node.detail ? Math.max(1, Math.ceil(node.detail.length / 28)) : 0
  const reference = node.planLabel ?? node.planRef
  const referenceLines = reference ? Math.max(1, Math.ceil(`Plan · ${reference}`.length / 28)) : 0
  let height = 28
  height += 20
  height += labelLines * 22
  if (detailLines > 0) height += 8 + detailLines * 20
  if (referenceLines > 0) height += 10 + referenceLines * 16
  return { width: CARD_WIDTH, height }
}

export const WORKFLOW_ELK_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.padding': '[top=0,left=0,bottom=0,right=0]',
  'elk.spacing.nodeNode': '48',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.layered.spacing.edgeNodeBetweenLayers': '24',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
}

export function roundLayout(value: number): number {
  return Math.round(value * 100) / 100
}
