import { preparePlanSource } from '../src/planMdx/frontmatter.ts'
import { buildMdxOutline } from '../src/planMdx/outline.ts'

/**
 * The plan header (ADR 0039): an eyebrow over the plan's first heading and fact chips under it,
 * worked out from the plan file and the answers so far. The author writes nothing for it.
 */
export type PlanFact = { key: string; before?: string; strong: string; text: string; title?: string }

export type PlanHeaderInfo = { eyebrow: string; facts: PlanFact[] }

const MODE_NAMES: Record<string, string> = { watch: 'Watch', comment: 'Comments', review: 'Review', execute: 'Running', execution: 'Running' }

export function planHeaderInfo(source: string, answered: ReadonlySet<string>, mode?: string): PlanHeaderInfo {
  let meta: Record<string, unknown> = {}
  let body = source
  try {
    const prepared = preparePlanSource(source)
    meta = prepared.meta
    body = prepared.body
  } catch {
    // Front matter that does not parse leaves the header without its agent.
  }
  const agent = typeof meta.agent === 'string' ? meta.agent.trim() : ''
  const modeName = mode ? MODE_NAMES[mode] : typeof meta.mode === 'string' ? MODE_NAMES[meta.mode] : undefined
  const eyebrow = ['Living plan', modeName, agent].filter(Boolean).join(' · ')

  let outline: ReturnType<typeof buildMdxOutline>
  try {
    outline = buildMdxOutline(body)
  } catch {
    return { eyebrow, facts: [] }
  }
  const facts: PlanFact[] = []
  const phases = outline.entries.flatMap((entry) => (entry.type === 'phase' ? [entry] : []))
  if (phases.length > 0) {
    const done = phases.filter((phase) => phase.status === 'done').length
    const currentIndex = phases.findIndex((phase) => phase.status === 'active')
    const current = currentIndex >= 0 ? phases[currentIndex] : undefined
    if (current) {
      facts.push({
        key: 'current',
        before: 'Phase',
        strong: `${currentIndex + 1}`,
        text: `of ${phases.length} · ${current.title}`,
        title: `Phase ${currentIndex + 1} of ${phases.length}: ${current.title}`,
      })
    }
    facts.push(
      done === phases.length
        ? { key: 'done', strong: 'All', text: `${phases.length} phases done` }
        : { key: 'done', strong: `${done}/${phases.length}`, text: 'phases done' },
    )
    const blocked = phases.filter((phase) => phase.status === 'blocked' || phase.status === 'failed').length
    if (blocked > 0) facts.push({ key: 'blocked', strong: `${blocked}`, text: blocked === 1 ? 'phase blocked' : 'phases blocked' })
  }
  if (outline.interactionIds.length > 0) {
    const open = outline.interactionIds.filter((id) => !answered.has(id)).length
    facts.push(
      open === 0
        ? { key: 'open', strong: 'All', text: 'questions answered' }
        : { key: 'open', strong: `${open}`, text: open === 1 ? 'open question' : 'open questions' },
    )
  }
  return { eyebrow, facts }
}
