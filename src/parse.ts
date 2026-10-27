import { buildOutline } from './markdoc/outline'
import { parseMarkup } from './markdoc/parseMarkup'
import { slugify } from './markdoc/payload'
import { markupErrors, planConfig } from './markdoc/schema'
import { renderState } from './markdoc/scope'
import { preparePlanSource } from './markdoc/source'
import { recordLog } from './serviceLog'
import type { PlanBlock, PlanDocument } from './types'

function rememberParseFailure(error: unknown, where: string, sourcePath?: string, planId?: string): void {
  const reason = error instanceof Error && error.message ? error.message : 'Could not parse the plan'
  const detail = [where, sourcePath ? `file: ${sourcePath}` : undefined, error instanceof Error ? error.stack : undefined]
    .filter((part): part is string => Boolean(part))
    .join('\n')
  void recordLog({
    level: 'error',
    message: `Failed to parse the plan: ${reason}`,
    detail,
    source: 'parse',
    planId,
    echo: false,
  }).catch(() => undefined)
}

export function parsePlan(source: string, sourcePath?: string, planId?: string): PlanDocument {
  let meta: Record<string, unknown>
  let body: string
  let rewritten: string
  try {
    const prepared = preparePlanSource(source)
    meta = prepared.meta
    body = prepared.body
    rewritten = prepared.rewritten
  } catch (error) {
    rememberParseFailure(error, 'frontmatter', sourcePath, planId)
    throw error
  }

  let outline: ReturnType<typeof buildOutline>
  try {
    const ast = parseMarkup(rewritten)
    const config = planConfig(renderState(rewritten))
    const errors = markupErrors(ast, config)
    if (errors.length > 0) throw new Error(errors.join('\n'))
    outline = buildOutline(ast, rewritten)
  } catch (error) {
    rememberParseFailure(error, 'markup', sourcePath, planId)
    throw error
  }

  const titleFromMeta = meta.title ? String(meta.title) : undefined
  const titleFromHeading = body.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const title = titleFromMeta ?? titleFromHeading ?? 'Living plan'

  return {
    title,
    summary: meta.summary ? String(meta.summary) : undefined,
    agent: meta.agent ? String(meta.agent) : undefined,
    mode: meta.mode === 'review' ? 'review' : meta.mode === 'watch' ? 'watch' : undefined,
    sourcePath,
    source,
    blocks: outline.blocks,
    entries: outline.entries,
    interactionIds: outline.interactionIds,
  }
}

export function collectSectionSources(plan: PlanDocument): string[] {
  return plan.blocks.map((block) => block.source.trim())
}

/** Scope shared by a block and the parts rendered inside it. */
export function planPartScope(block: PlanBlock, index: number): string {
  switch (block.type) {
    case 'markdown':
      return `markdown:${index}`
    case 'phase':
      return `phase:${block.id}`
    case 'callout':
      return `callout:${block.id ?? index}`
    case 'choice':
      return `choice:${block.id}`
    case 'approve':
      return `approve:${block.id}`
    case 'form':
      return `form:${block.id}`
    case 'questions':
      return `questions:${block.id}`
    case 'checklist':
      return `checklist:${block.id ?? index}`
    case 'workflow':
      return `workflow:${block.id}`
  }
}

/** Stable id used to link a workflow step back to a plan section. */
export function blockAnchorId(block: PlanBlock, index: number): string | undefined {
  switch (block.type) {
    case 'phase':
    case 'choice':
    case 'approve':
    case 'form':
    case 'questions':
    case 'workflow':
      return block.id
    case 'checklist':
      return block.id ?? (block.title ? `checklist-${slugify(block.title)}-${index}` : undefined)
    case 'callout':
      return block.id ?? (block.title ? `callout-${slugify(block.title)}-${index}` : undefined)
    case 'markdown':
      return undefined
  }
}
