import Markdoc, { type Config, type Node, type RenderableTreeNode, Tag } from '@markdoc/markdoc'
import type { InteractionResponse, SectionDiff } from '../types'

export type PartCounts = {
  heading: number
  paragraph: number
  'list-item': number
  diagram: number
  code: number
}

export type PlanRenderState = {
  source: string
  responses: Record<string, InteractionResponse>
  locked: boolean
  diffs: SectionDiff[]
  partScope: string
  partCounts: PartCounts
  sectionIndex: number
  depth: number
}

export function freshCounts(): PartCounts {
  return { heading: 0, paragraph: 0, 'list-item': 0, diagram: 0, code: 0 }
}

export function renderState(source: string, extras: Partial<PlanRenderState> = {}): PlanRenderState {
  return {
    source,
    responses: {},
    locked: false,
    diffs: [],
    partScope: '',
    partCounts: freshCounts(),
    sectionIndex: 0,
    depth: 0,
    ...extras,
  }
}

export function stateOf(config: Config): PlanRenderState {
  return config.variables as PlanRenderState
}

export function partAttrs(scope: string, kind: string, index: number | string): Record<string, string> {
  return {
    'data-plan-part': `${scope}/${kind}:${index}`,
    'data-plan-kind': kind,
  }
}

export function withNewlines(nodes: RenderableTreeNode[]): RenderableTreeNode[] {
  const out: RenderableTreeNode[] = []
  for (const node of nodes) {
    if (node == null || node === false) continue
    if (out.length > 0) out.push('\n')
    out.push(node)
  }
  return out
}

export function nodesToHtml(nodes: RenderableTreeNode[]): string {
  if (nodes.length === 0) return ''
  return Markdoc.renderers.html(withNewlines(nodes))
}

/** Render markdown children with a part-id scope. Fence line numbers use `fenceSource`. */
export function transformScoped(
  nodes: Node[],
  config: Config,
  scope: string,
  fenceSource: string,
): RenderableTreeNode[] {
  const vars = stateOf(config)
  const previous = {
    source: vars.source,
    partScope: vars.partScope,
    partCounts: vars.partCounts,
  }
  vars.source = fenceSource
  vars.partScope = scope
  vars.partCounts = freshCounts()
  try {
    const rendered: RenderableTreeNode[] = []
    for (const node of nodes) {
      const next = Markdoc.transform(node, config) as RenderableTreeNode | RenderableTreeNode[]
      if (Array.isArray(next)) rendered.push(...next.filter((child) => child != null))
      else if (next != null) rendered.push(next)
    }
    return rendered
  } finally {
    vars.source = previous.source
    vars.partScope = previous.partScope
    vars.partCounts = previous.partCounts
  }
}

export function isTag(value: unknown): value is Tag {
  return Tag.isTag(value)
}
