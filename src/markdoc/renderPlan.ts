import Markdoc, { Tag, type RenderableTreeNode } from '@markdoc/markdoc'
import { parseMarkup } from './parseMarkup'
import type { InteractionResponse, PlanDocument, SectionDiff } from '../types'
import { planConfig, proseSection } from './schema'
import { planSections } from './sections'
import { nodesToHtml, renderState, transformScoped } from './scope'
import type { Node } from '@markdoc/markdoc'
import { preparePlanSource } from './source'
import { sourceStamp } from '../sourceStamp'

export function renderPlanHtml(
  plan: PlanDocument,
  options: {
    responses: Record<string, InteractionResponse>
    locked: boolean
    diffs: SectionDiff[]
  },
): string {
  const { rewritten } = preparePlanSource(plan.source)
  const ast = parseMarkup(rewritten)
  const state = renderState(rewritten, {
    responses: options.responses,
    locked: options.locked,
    diffs: options.diffs,
  })
  const config = planConfig(state)
  const rendered: RenderableTreeNode[] = []
  planSections(ast, rewritten).forEach((section, index) => {
    state.sectionIndex = index
    const node =
      section.kind === 'prose' ? proseSection(section.nodes, config, index) : Markdoc.transform(section.node, config)
    if (!Tag.isTag(node)) return
    const status = options.diffs.find((diff) => diff.index === index)?.status ?? 'unchanged'
    const className = typeof node.attributes.class === 'string' ? node.attributes.class : ''
    node.attributes.class = `${className} diff-${status}`.trim()
    node.attributes['data-plan-stamp'] = sourceStamp(section.source)
    rendered.push(node)
  })
  return nodesToHtml(rendered)
}

/** Inner HTML for one scope. `fenceSource` is the string fence line numbers are counted in. */
export function htmlFor(nodes: Node[], fenceSource: string, scope: string): string {
  const state = renderState(fenceSource)
  return nodesToHtml(transformScoped(nodes, planConfig(state), scope, fenceSource))
}
