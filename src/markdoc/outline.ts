import type { Node } from '@markdoc/markdoc'
import type { PlanBlock, PlanEntry } from '../types'
import { htmlFor } from './renderPlan'
import {
  anchorFor,
  calloutKind,
  checklistItems,
  choiceOptions,
  collapsedText,
  contentNodes,
  entryBody,
  formFields,
  mergeEntry,
  phaseStatus,
  questionItems,
  slugify,
  workflowEdges,
  workflowNodes,
} from './payload'
import { isEntry, planSections } from './sections'

const INTERACTION = new Set(['choice', 'approve', 'form', 'questions'])

export function buildOutline(doc: Node, source: string): {
  blocks: PlanBlock[]
  entries: PlanEntry[]
  interactionIds: string[]
} {
  const entries: PlanEntry[] = []
  const blocks = planSections(doc, source).map((section, index) => {
    if (section.kind === 'prose') {
      return {
        type: 'markdown' as const,
        html: htmlFor(section.nodes, source, `markdown:${index}`),
        source: section.source,
      }
    }
    collectEntries(section.node, source, index, entries)
    return blockFrom(section.node, section.source, source, index)
  })
  return {
    blocks,
    entries,
    interactionIds: entries.flatMap((entry) =>
      entry.id && INTERACTION.has(entry.type) ? [entry.id] : [],
    ),
  }
}

function collectEntries(node: Node, source: string, sectionIndex: number, entries: PlanEntry[]): void {
  if (!(node.type === 'tag' && node.tag && isEntry(node))) {
    for (const child of node.children) collectEntries(child, source, sectionIndex, entries)
    return
  }
  const data = mergeEntry(node)
  entries.push(toEntry(node, data, sectionIndex))
  const body = entryBody(node, data, source)
  for (const child of body.nodes) collectEntries(child, body.fenceSource, sectionIndex, entries)
}

function toEntry(node: Node, data: Record<string, unknown>, sectionIndex: number): PlanEntry {
  const tag = node.tag ?? ''
  if (tag === 'phase') {
    const title = String(data.title ?? 'Untitled phase')
    const id = String(data.id ?? (slugify(title) || 'phase'))
    return { type: 'phase', id, title, status: phaseStatus(data.status), anchor: id }
  }
  if (tag === 'callout') {
    const title = data.title ? String(data.title) : undefined
    const id = data.id ? String(data.id) : undefined
    return {
      type: 'callout',
      id,
      title,
      kind: calloutKind(data.kind),
      anchor: anchorFor('callout', { id, title }, sectionIndex),
    }
  }
  if (tag === 'choice') {
    const nodes = contentNodes(node)
    const prompt = String(data.prompt ?? '').trim() || collapsedText(nodes) || 'Choose one'
    const id = String(data.id ?? (slugify(prompt) || 'choice'))
    return { type: 'choice', id, prompt, anchor: id }
  }
  if (tag === 'approve') {
    const prompt = String(data.prompt ?? 'Approve this step?')
    const id = String(data.id ?? (slugify(prompt) || 'approve'))
    return { type: 'approve', id, prompt, anchor: id }
  }
  if (tag === 'form') {
    const prompt = String(data.prompt ?? 'Provide details')
    const id = String(data.id ?? (slugify(prompt) || 'form'))
    return { type: 'form', id, prompt, anchor: id }
  }
  if (tag === 'questions') {
    const prompt = data.prompt ? String(data.prompt) : undefined
    const id = String(data.id ?? (slugify(prompt ?? 'questions') || 'questions'))
    return { type: 'questions', id, prompt, anchor: id }
  }
  if (tag === 'checklist') {
    const title = data.title ? String(data.title) : undefined
    const id = data.id ? String(data.id) : undefined
    return { type: 'checklist', id, title, anchor: anchorFor('checklist', { id, title }, sectionIndex) }
  }
  const title = data.title ? String(data.title) : undefined
  const id = String(data.id ?? '').trim() || slugify(title ?? 'workflow') || 'workflow'
  return {
    type: 'workflow',
    id,
    title,
    nodes: workflowNodes(data),
    edges: workflowEdges(data),
    anchor: id,
  }
}

function blockFrom(node: Node, sectionSource: string, source: string, index: number): PlanBlock {
  const data = mergeEntry(node)
  const tag = node.tag ?? 'markdown'
  if (tag === 'phase') {
    const title = String(data.title ?? 'Untitled phase')
    const id = String(data.id ?? (slugify(title) || 'phase'))
    const body = entryBody(node, data, source)
    return {
      type: 'phase',
      id,
      title,
      status: phaseStatus(data.status),
      bodyHtml: htmlFor(body.nodes, body.fenceSource, `phase:${id}`),
      source: sectionSource,
    }
  }
  if (tag === 'callout') {
    const title = data.title ? String(data.title) : undefined
    const id = data.id ? String(data.id) : undefined
    const scope = `callout:${id ?? index}`
    const body = entryBody(node, data, source)
    return {
      type: 'callout',
      id,
      kind: calloutKind(data.kind),
      title,
      bodyHtml: htmlFor(body.nodes, body.fenceSource, scope),
      source: sectionSource,
    }
  }
  if (tag === 'choice') {
    const nodes = contentNodes(node)
    const prompt = String(data.prompt ?? '').trim() || collapsedText(nodes) || 'Choose one'
    const id = String(data.id ?? (slugify(prompt) || 'choice'))
    return { type: 'choice', id, prompt, options: choiceOptions(data, nodes), source: sectionSource }
  }
  if (tag === 'approve') {
    const prompt = String(data.prompt ?? 'Approve this step?')
    const id = String(data.id ?? (slugify(prompt) || 'approve'))
    const body = entryBody(node, data, source)
    return {
      type: 'approve',
      id,
      prompt,
      bodyHtml: htmlFor(body.nodes, body.fenceSource, `approve:${id}`),
      source: sectionSource,
    }
  }
  if (tag === 'form') {
    const prompt = String(data.prompt ?? 'Provide details')
    const id = String(data.id ?? (slugify(prompt) || 'form'))
    return { type: 'form', id, prompt, fields: formFields(data), source: sectionSource }
  }
  if (tag === 'questions') {
    const nodes = contentNodes(node)
    const prompt = data.prompt ? String(data.prompt) : undefined
    const id = String(data.id ?? (slugify(prompt ?? 'questions') || 'questions'))
    return { type: 'questions', id, prompt, items: questionItems(data, nodes), source: sectionSource }
  }
  if (tag === 'checklist') {
    const nodes = contentNodes(node)
    const title = data.title ? String(data.title) : undefined
    const id = data.id ? String(data.id) : undefined
    return { type: 'checklist', id, title, items: checklistItems(data, nodes), source: sectionSource }
  }
  const title = data.title ? String(data.title) : undefined
  const id = String(data.id ?? '').trim() || slugify(title ?? 'workflow') || 'workflow'
  return { type: 'workflow', id, title, nodes: workflowNodes(data), edges: workflowEdges(data), source: sectionSource }
}
