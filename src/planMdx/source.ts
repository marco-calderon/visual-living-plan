import { workflowStepHash } from '../planRefNavigation'
import { activeStepSpinnerHtml, stepNumberFor } from '../planStepHeading'
import { buildMdxOutline, legacyPlanSyntaxError } from './outline'
import type { PlanBlock } from '../types'

const ENTRY_FENCES = new Set([
  'phase',
  'choice',
  'approve',
  'form',
  'questions',
  'checklist',
  'callout',
  'workflow',
])

/** A plan file is already MDX. Entry fences and {% tags %} are not rewritten. */
export function planSourceToMdx(source: string): string {
  const body = stripFrontmatter(source)
  const legacy = legacyPlanSyntaxError(body)
  if (legacy) throw new Error(legacy)
  return `${body.trim()}\n`
}

export function planSourceFlags(source: string): { mermaid: boolean; code: boolean } {
  let mermaid = false
  let code = false
  const entries = new Set([...ENTRY_FENCES, 'yaml', 'yml', 'chart'])
  for (const match of source.matchAll(/```([^\n`]*)/g)) {
    const name = (match[1] ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? ''
    if (!name) continue
    if (name === 'mermaid') mermaid = true
    else if (!entries.has(name)) code = true
  }
  return { mermaid, code }
}

/**
 * HTML for the plan column when the MDX bundle is not on the page.
 * The open page replaces this with the compiled MDX app.
 */
export function renderPlanStaticHtml(source: string): string {
  const body = stripFrontmatter(source)
  const legacy = legacyPlanSyntaxError(body)
  if (legacy) throw new Error(legacy)
  const outline = buildMdxOutline(body)
  let phaseOrdinal = 0
  const html = outline.blocks
    .map((block) => {
      const ordinal = block.type === 'phase' ? ++phaseOrdinal : 0
      return staticBlock(block, ordinal)
    })
    .join('\n')
  return `<article class="plan-document plan-ui" data-plan-rendered>${html}</article>`
}

function stripFrontmatter(source: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(source)
  return match ? source.slice(match[0].length) : source
}

function staticBlock(block: PlanBlock, phaseOrdinal = 1): string {
  if (block.type === 'markdown') return block.html
  if (block.type === 'workflow') {
    const links = block.nodes
      .map((node) => {
        const ref = node.ref || node.id
        const label = node.label || node.id
        return `<a class="workflow-step" href="#plan-${escapeHtml(ref)}" data-plan-jump="${escapeHtml(ref)}">${escapeHtml(label)}</a>`
      })
      .join('\n')
    const title = block.title || 'Expected execution'
    return `<section class="block plan-entry plan-workflow"${block.id ? ` id="plan-${escapeHtml(block.id)}"` : ''} data-entry="workflow"><h3 class="plan-title">${escapeHtml(title)}</h3>${links}</section>`
  }
  if (block.type === 'phase') {
    const step = stepNumberFor(block.title, phaseOrdinal)
    const href = workflowStepHash(block.id)
    const spinner = block.status === 'active' ? activeStepSpinnerHtml() : ''
    const jump = `href="${escapeHtml(href)}" data-workflow-jump="${escapeHtml(block.id)}"`
    return `<section class="block plan-entry plan-phase" id="plan-${escapeHtml(block.id)}" data-entry="phase" data-entry-id="${escapeHtml(block.id)}" data-status="${escapeHtml(block.status)}"><div class="plan-step-heading"><a class="plan-step-number" ${jump} aria-label="Step ${escapeHtml(step.number)}">${escapeHtml(step.number)}</a><div class="plan-step-copy"><h3 class="plan-title"><a class="plan-step-label" ${jump}>${escapeHtml(step.label)}</a></h3><span class="plan-phase-status">${spinner}${escapeHtml(block.status)}</span></div></div>${block.bodyHtml}</section>`
  }
  if (block.type === 'callout') {
    const anchor = block.id ? ` id="plan-${escapeHtml(block.id)}"` : ''
    const title = block.title ? `<h3 class="plan-title">${escapeHtml(block.title)}</h3>` : ''
    return `<section class="block plan-entry plan-callout"${anchor} data-entry="callout">${title}${block.bodyHtml}</section>`
  }
  if (block.type === 'choice') {
    const buttons = block.options
      .map(
        (option) =>
          `<button type="button" data-choice-id="${escapeHtml(block.id)}" data-option-id="${escapeHtml(option.id)}" data-option-label="${escapeHtml(option.label)}">${escapeHtml(option.label)}</button>`,
      )
      .join('')
    return `<section class="block plan-entry plan-choice" id="plan-${escapeHtml(block.id)}" data-entry="choice" data-entry-id="${escapeHtml(block.id)}"><h3 class="plan-title">${escapeHtml(block.prompt)}</h3>${buttons}<p class="plan-state" data-state-for="${escapeHtml(block.id)}">Waiting for a selection</p></section>`
  }
  if (block.type === 'form') {
    const fields = block.fields.map((field) => `<input name="${escapeHtml(field.name)}" />`).join('')
    return `<section class="block plan-entry plan-form" id="plan-${escapeHtml(block.id)}" data-entry="form"><h3 class="plan-title">${escapeHtml(block.prompt)}</h3><form data-form-id="${escapeHtml(block.id)}">${fields}<p class="plan-state" data-state-for="${escapeHtml(block.id)}">Waiting for form values</p></form></section>`
  }
  if (block.type === 'questions') {
    const fields = block.items.map((_, itemIndex) => `<textarea name="${itemIndex}"></textarea>`).join('')
    return `<section class="block plan-entry plan-questions" id="plan-${escapeHtml(block.id)}" data-entry="questions"><form data-questions-id="${escapeHtml(block.id)}">${fields}<p class="plan-state" data-state-for="${escapeHtml(block.id)}">Waiting for answers</p></form></section>`
  }
  if (block.type === 'approve') {
    return `<section class="block plan-entry plan-approve" id="plan-${escapeHtml(block.id)}" data-entry="approve" data-interaction-id="${escapeHtml(block.id)}"><h3 class="plan-title">${escapeHtml(block.prompt)}</h3>${block.bodyHtml}<p class="plan-state" data-state-for="${escapeHtml(block.id)}">Waiting for approval</p></section>`
  }
  const title = block.title ? `<h3 class="plan-title">${escapeHtml(block.title)}</h3>` : ''
  return `<section class="block plan-entry plan-checklist" data-entry="checklist">${title}</section>`
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
