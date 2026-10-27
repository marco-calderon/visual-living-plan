import Markdoc, { Tag, type Config, type Node, type Schema, type ValidationError } from '@markdoc/markdoc'
import {
  approveCard,
  calloutCard,
  checklistCard,
  choiceCard,
  formCard,
  markdownSection,
  phaseCard,
  questionsCard,
  statusChip,
  workflowCard,
} from './cards'
import {
  anchorFor,
  calloutKind,
  checklistItems,
  choiceOptions,
  collapsedText,
  contentNodes,
  entryBody,
  fenceInfo,
  fenceParts,
  formFields,
  mergeEntry,
  phaseStatus,
  questionItems,
  slugify,
  workflowEdges,
  workflowNodes,
} from './payload'
import { partAttrs, stateOf, transformScoped, type PlanRenderState } from './scope'

const hiddenString = { type: String, render: false as const }
const hiddenArray = { type: Array, render: false as const }

function disabledTag(name: string): Schema {
  return {
    validate(): ValidationError[] {
      return [
        {
          id: 'tag-disabled',
          level: 'error',
          message: `Tag '${name}' is not available in plan files.`,
        },
      ]
    },
    transform() {
      return new Tag('p', { class: 'markup-error' }, [`Tag '${name}' is not available in plan files.`])
    },
  }
}

function disabledFunction(name: string) {
  return {
    validate(): ValidationError[] {
      return [
        {
          id: 'function-disabled',
          level: 'error',
          message: `Function '${name}' is not available in plan files.`,
        },
      ]
    },
    transform() {
      return null
    },
  }
}

function parentTags(config: Config): string[] {
  return (config.validation?.parents ?? []).flatMap((parent) => (parent.tag ? [parent.tag] : []))
}

const nodes: Config['nodes'] = {
  heading: {
    ...Markdoc.nodes.heading,
    transform(node, config) {
      const state = stateOf(config)
      state.partCounts.heading += 1
      const level = Number(node.attributes.level ?? 1)
      return new Tag(
        `h${level}`,
        partAttrs(state.partScope, 'heading', state.partCounts.heading),
        node.transformChildren(config),
      )
    },
  },
  paragraph: {
    ...Markdoc.nodes.paragraph,
    transform(node, config) {
      const state = stateOf(config)
      state.partCounts.paragraph += 1
      return new Tag(
        'p',
        partAttrs(state.partScope, 'paragraph', state.partCounts.paragraph),
        node.transformChildren(config),
      )
    },
  },
  item: {
    ...Markdoc.nodes.item,
    transform(node, config) {
      const state = stateOf(config)
      state.partCounts['list-item'] += 1
      return new Tag(
        'li',
        partAttrs(state.partScope, 'list-item', state.partCounts['list-item']),
        node.transformChildren(config),
      )
    },
  },
  list: {
    ...Markdoc.nodes.list,
    transform(node, config) {
      const attrs: Record<string, string> = {}
      const start = node.attributes.start
      if (node.attributes.ordered && typeof start === 'number' && start > 1) attrs.start = String(start)
      return new Tag(node.attributes.ordered ? 'ol' : 'ul', attrs, node.transformChildren(config))
    },
  },
  fence: {
    ...Markdoc.nodes.fence,
    transform(node, config) {
      const state = stateOf(config)
      const parts = fenceParts(fenceInfo(node, state.source))
      const content = String(node.attributes.content ?? '').replace(/\n$/, '')
      if (parts.language === 'mermaid' && !parts.diff && content.trim()) {
        state.partCounts.diagram += 1
        return new Tag(
          'figure',
          {
            class: 'mermaid-diagram',
            ...partAttrs(state.partScope, 'diagram', state.partCounts.diagram),
          },
          [new Tag('pre', { class: 'mermaid' }, [content])],
        )
      }
      state.partCounts.code += 1
      const attrs: Record<string, string> = {
        class: 'code-block',
        ...partAttrs(state.partScope, 'code', state.partCounts.code),
      }
      if (parts.language) attrs['data-lang'] = parts.language
      if (!parts.diff && parts.start >= 1) attrs['data-start'] = String(parts.start)
      if (parts.diff) attrs['data-diff'] = 'true'
      return new Tag('pre', attrs, [new Tag('code', {}, [content])])
    },
  },
  table: {
    ...Markdoc.nodes.table,
    transform(node, config) {
      return new Tag('div', { class: 'rich-table' }, [new Tag('table', {}, node.transformChildren(config))])
    },
  },
  th: {
    ...Markdoc.nodes.th,
    transform(node, config) {
      return new Tag('th', alignClass(node.attributes.align), node.transformChildren(config))
    },
  },
  td: {
    ...Markdoc.nodes.td,
    transform(node, config) {
      return new Tag('td', alignClass(node.attributes.align), node.transformChildren(config))
    },
  },
}

function alignClass(align: unknown): Record<string, string> {
  if (align === 'center') return { class: 'align-center' }
  if (align === 'right') return { class: 'align-right' }
  return {}
}

function bodyOf(node: Node, data: Record<string, unknown>, config: Config, scope: string) {
  const state = stateOf(config)
  const body = entryBody(node, data, state.source)
  return transformScoped(body.nodes, config, scope, body.fenceSource)
}

const tags: Config['tags'] = {
  if: disabledTag('if'),
  else: disabledTag('else'),
  partial: disabledTag('partial'),
  slot: disabledTag('slot'),
  table: disabledTag('table'),
  phase: {
    attributes: { id: hiddenString, title: hiddenString, status: hiddenString },
    transform(node, config) {
      const data = mergeEntry(node)
      const title = String(data.title ?? 'Untitled phase')
      const id = String(data.id ?? (slugify(title) || 'phase'))
      const scope = `phase:${id}`
      const state = stateOf(config)
      return phaseCard({
        id,
        title,
        status: phaseStatus(data.status),
        anchorId: anchorFor('phase', { id, title }, state.sectionIndex),
        scope,
        body: bodyOf(node, data, config, scope),
      })
    },
  },
  callout: {
    attributes: { id: hiddenString, kind: hiddenString, title: hiddenString },
    transform(node, config) {
      const data = mergeEntry(node)
      const title = data.title ? String(data.title) : undefined
      const id = data.id ? String(data.id) : undefined
      const state = stateOf(config)
      const scope = `callout:${id ?? state.sectionIndex}`
      return calloutCard({
        kind: calloutKind(data.kind),
        title,
        anchorId: anchorFor('callout', { id, title }, state.sectionIndex),
        scope,
        body: bodyOf(node, data, config, scope),
      })
    },
  },
  choice: {
    attributes: { id: hiddenString, prompt: hiddenString, options: hiddenArray },
    transform(node, config) {
      const data = mergeEntry(node)
      const nodes = contentNodes(node)
      const prompt = String(data.prompt ?? '').trim() || collapsedText(nodes) || 'Choose one'
      const id = String(data.id ?? (slugify(prompt) || 'choice'))
      const state = stateOf(config)
      return choiceCard({
        id,
        prompt,
        options: choiceOptions(data, nodes),
        anchorId: anchorFor('choice', { id }, state.sectionIndex),
        scope: `choice:${id}`,
        responses: state.responses,
        locked: state.locked,
      })
    },
  },
  option: {
    attributes: { id: hiddenString, label: hiddenString },
    validate(node, config) {
      if (parentTags(config).includes('choice')) return []
      return [{ id: 'option-parent', level: 'error', message: 'An option tag belongs inside a choice.' }]
    },
    transform() {
      return []
    },
  },
  approve: {
    attributes: { id: hiddenString, prompt: hiddenString },
    transform(node, config) {
      const data = mergeEntry(node)
      const prompt = String(data.prompt ?? 'Approve this step?')
      const id = String(data.id ?? (slugify(prompt) || 'approve'))
      const scope = `approve:${id}`
      const state = stateOf(config)
      return approveCard({
        id,
        prompt,
        anchorId: anchorFor('approve', { id }, state.sectionIndex),
        scope,
        body: bodyOf(node, data, config, scope),
        responses: state.responses,
        locked: state.locked,
      })
    },
  },
  form: {
    attributes: { id: hiddenString, prompt: hiddenString, fields: hiddenArray },
    transform(node, config) {
      const data = mergeEntry(node)
      const prompt = String(data.prompt ?? 'Provide details')
      const id = String(data.id ?? (slugify(prompt) || 'form'))
      const state = stateOf(config)
      return formCard({
        id,
        prompt,
        fields: formFields(data),
        anchorId: anchorFor('form', { id }, state.sectionIndex),
        scope: `form:${id}`,
        responses: state.responses,
        locked: state.locked,
      })
    },
  },
  questions: {
    attributes: { id: hiddenString, prompt: hiddenString, items: hiddenArray },
    transform(node, config) {
      const data = mergeEntry(node)
      const nodes = contentNodes(node)
      const prompt = data.prompt ? String(data.prompt) : undefined
      const id = String(data.id ?? (slugify(prompt ?? 'questions') || 'questions'))
      const state = stateOf(config)
      return questionsCard({
        id,
        prompt,
        items: questionItems(data, nodes),
        anchorId: anchorFor('questions', { id }, state.sectionIndex),
        scope: `questions:${id}`,
        responses: state.responses,
        locked: state.locked,
      })
    },
  },
  checklist: {
    attributes: { id: hiddenString, title: hiddenString, items: hiddenArray },
    transform(node, config) {
      const data = mergeEntry(node)
      const nodes = contentNodes(node)
      const title = data.title ? String(data.title) : undefined
      const id = data.id ? String(data.id) : undefined
      const state = stateOf(config)
      const scope = `checklist:${id ?? state.sectionIndex}`
      return checklistCard({
        title,
        items: checklistItems(data, nodes),
        anchorId: anchorFor('checklist', { id, title }, state.sectionIndex),
        scope,
      })
    },
  },
  workflow: {
    attributes: { id: hiddenString, title: hiddenString, nodes: hiddenArray, edges: hiddenArray },
    transform(node, config) {
      const data = mergeEntry(node)
      const title = data.title ? String(data.title) : undefined
      const id = String(data.id ?? '').trim() || slugify(title ?? 'workflow') || 'workflow'
      const state = stateOf(config)
      return workflowCard({
        id,
        title,
        nodes: workflowNodes(data),
        anchorId: anchorFor('workflow', { id, title }, state.sectionIndex),
        scope: `workflow:${id}`,
      })
    },
  },
  item: {
    attributes: { done: { type: Boolean, render: false } },
    validate(node, config) {
      const parents = parentTags(config)
      if (parents.includes('questions') || parents.includes('checklist')) return []
      return [{ id: 'item-parent', level: 'error', message: 'An item tag belongs inside questions or a checklist.' }]
    },
    transform() {
      return []
    },
  },
  status: {
    inline: true,
    selfClosing: true,
    attributes: {
      status: { type: String, render: false, default: 'pending' },
      label: { type: String, render: false },
    },
    transform(node) {
      const status = phaseStatus(node.attributes.status ?? 'pending')
      const label = node.attributes.label ? String(node.attributes.label) : status
      return statusChip(status, label)
    },
  },
}

export function planConfig(state: PlanRenderState): Config {
  return {
    nodes: { ...Markdoc.nodes, ...nodes },
    tags: { ...Markdoc.tags, ...tags },
    functions: {
      and: disabledFunction('and'),
      or: disabledFunction('or'),
      not: disabledFunction('not'),
      equals: disabledFunction('equals'),
      default: disabledFunction('default'),
      debug: disabledFunction('debug'),
    },
    partials: {},
    variables: state,
    validation: { validateFunctions: true },
  }
}

export function proseSection(nodes: Node[], config: Config, index: number): Tag {
  const state = stateOf(config)
  const scope = `markdown:${index}`
  const body = transformScoped(nodes, config, scope, state.source)
  return markdownSection({ scope, body })
}

export function markupErrors(ast: Node, config: Config): string[] {
  const found = Markdoc.validate(ast, config)
  return found
    .filter((entry) => entry.error.level === 'error' || entry.error.level === 'critical')
    .map((entry) => entry.error.message)
}
