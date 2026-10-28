import { parse as parseYaml } from 'yaml'

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

type Segment =
  | { kind: 'prose'; text: string }
  | { kind: 'entry'; name: string; data: Record<string, unknown> }
  | { kind: 'mermaid'; text: string }
  | { kind: 'code'; info: string; text: string }

/** Turn a `.plan.md` file into MDX the plan page compiles. Already-MDX sources pass through. */
export function planSourceToMdx(source: string): string {
  const body = stripFrontmatter(source)
  if (isMdxPlan(body)) return body.trim() + '\n'
  return segmentsToMdx(splitPlan(body)).trim() + '\n'
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
  if (isMdxPlan(body)) {
    return `<article class="plan-document plan-ui" data-plan-rendered>${escapeHtml(body)}</article>`
  }
  return `<article class="plan-document plan-ui" data-plan-rendered>${segmentsToHtml(splitPlan(body))}</article>`
}

function stripFrontmatter(source: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(source)
  return match ? source.slice(match[0].length) : source
}

function isMdxPlan(source: string): boolean {
  if (/^```(?:phase|choice|approve|form|questions|checklist|callout|workflow)\b/m.test(source)) return false
  if (/\{%\s*(?:phase|choice|approve|form|questions|checklist|callout|workflow|option|item|field)\b/.test(source)) {
    return false
  }
  return /<(?:phase|choice|approve|form|questions|checklist|callout|workflow|Stack|Row|Box)\b/.test(source)
}

function splitPlan(source: string): Segment[] {
  const lines = source.split('\n')
  const segments: Segment[] = []
  const prose: string[] = []
  const flush = () => {
    if (prose.length === 0) return
    segments.push({ kind: 'prose', text: prose.join('\n') })
    prose.length = 0
  }
  let index = 0
  while (index < lines.length) {
    const line = lines[index] ?? ''
    const opened = /^```([^\s`]*)(.*)$/.exec(line)
    if (!opened) {
      prose.push(line)
      index += 1
      continue
    }
    const name = (opened[1] ?? '').toLowerCase()
    const info = `${opened[1] ?? ''}${opened[2] ?? ''}`.trim()
    const body: string[] = []
    index += 1
    while (index < lines.length && !/^```\s*$/.test(lines[index] ?? '')) {
      body.push(lines[index] ?? '')
      index += 1
    }
    index += 1
    flush()
    const text = body.join('\n')
    if (ENTRY_FENCES.has(name)) {
      segments.push({ kind: 'entry', name, data: readYaml(text) })
    } else if (name === 'mermaid') {
      segments.push({ kind: 'mermaid', text })
    } else {
      segments.push({ kind: 'code', info, text })
    }
  }
  flush()
  return segments
}

function readYaml(text: string): Record<string, unknown> {
  try {
    const parsed = parseYaml(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function segmentsToMdx(segments: Segment[]): string {
  return segments
    .map((segment) => {
      if (segment.kind === 'prose') return proseToMdx(segment.text)
      if (segment.kind === 'mermaid') return `\`\`\`mermaid\n${segment.text}\n\`\`\``
      if (segment.kind === 'code') return `\`\`\`${segment.info}\n${segment.text}\n\`\`\``
      return entryToMdx(segment.name, segment.data)
    })
    .filter((part) => part.trim().length > 0)
    .join('\n\n')
}

function segmentsToHtml(segments: Segment[]): string {
  return segments
    .map((segment) => {
      if (segment.kind === 'prose') return proseToHtml(segment.text)
      if (segment.kind === 'mermaid') {
        return `<figure class="mermaid-diagram"><pre class="mermaid">${escapeHtml(segment.text)}</pre></figure>`
      }
      if (segment.kind === 'code') return codeHtml(segment.info, segment.text)
      return entryToHtml(segment.name, segment.data)
    })
    .join('\n')
}

function entryToMdx(name: string, data: Record<string, unknown>): string {
  if (name === 'workflow') return workflowMdx(data)
  if (name === 'choice') return choiceMdx(data)
  if (name === 'form') return formMdx(data)
  if (name === 'questions') return questionsMdx(data)
  if (name === 'checklist') return checklistMdx(data)
  const attrs = attrList(entryAttrs(name, data))
  const inner = mdxChildren(data)
  return `<${name}${attrs}>\n${inner}\n</${name}>`
}

function entryToHtml(name: string, data: Record<string, unknown>): string {
  if (name === 'workflow') return workflowHtml(data)
  const id = text(data.id)
  const anchor = id ? ` id="plan-${escapeHtml(id)}"` : ''
  const title = text(data.title || data.prompt)
  const heading = title ? `<h3 class="plan-title">${escapeHtml(title)}</h3>` : ''
  const body = typeof data.body === 'string' ? proseToHtml(dedent(data.body)) : ''
  const extra =
    name === 'choice'
      ? choiceHtml(data)
      : name === 'form'
        ? formHtml(data)
        : name === 'questions'
          ? questionsHtml(data)
          : name === 'checklist'
            ? checklistHtml(data)
            : name === 'approve'
              ? approveHtml(data)
              : ''
  return `<section class="block plan-entry plan-${escapeHtml(name)}"${anchor} data-entry="${escapeHtml(name)}"${id ? ` data-entry-id="${escapeHtml(id)}"` : ''}${name === 'approve' && id ? ` data-interaction-id="${escapeHtml(id)}"` : ''}>${heading}${body}${extra}</section>`
}

function entryAttrs(name: string, data: Record<string, unknown>): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const key of ['id', 'title', 'prompt', 'status', 'kind'] as const) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) attrs[key] = value
  }
  if (name === 'callout' && !attrs.kind) attrs.kind = 'note'
  return attrs
}

function mdxChildren(data: Record<string, unknown>): string {
  const body = typeof data.body === 'string' ? data.body : typeof data.description === 'string' ? data.description : ''
  return escapeMdxText(dedent(body))
}

function choiceMdx(data: Record<string, unknown>): string {
  const options = records(data.options)
    .map((option) => {
      const id = text(option.id)
      const label = text(option.label)
      const description = text(option.description)
      if (!id || !label) return ''
      return `<option id="${escapeAttr(id)}" label="${escapeAttr(label)}">\n${escapeMdxText(description)}\n</option>`
    })
    .filter(Boolean)
    .join('\n')
  return `<choice${attrList(entryAttrs('choice', data))}>\n${options}\n</choice>`
}

function formMdx(data: Record<string, unknown>): string {
  const fields = records(data.fields)
    .map((field) => {
      const name = text(field.name)
      const label = text(field.label)
      if (!name || !label) return ''
      const attrs: Record<string, string> = { name, label }
      const type = text(field.type)
      if (type) attrs.type = type
      if (field.required === true) attrs.required = 'true'
      if (field.default !== undefined && field.default !== null) attrs.default = String(field.default)
      if (typeof field.placeholder === 'string') attrs.placeholder = field.placeholder
      const options = stringList(field.options)
      if (options.length > 0) attrs.options = options.join(', ')
      return `<field${attrList(attrs)} />`
    })
    .filter(Boolean)
    .join('\n')
  return `<form${attrList(entryAttrs('form', data))}>\n${fields}\n</form>`
}

function questionsMdx(data: Record<string, unknown>): string {
  const items = stringList(data.items)
    .map((item) => `<item>\n${escapeMdxText(item)}\n</item>`)
    .join('\n')
  return `<questions${attrList(entryAttrs('questions', data))}>\n${items}\n</questions>`
}

function checklistMdx(data: Record<string, unknown>): string {
  const items = records(data.items)
    .map((item) => {
      const label = text(item.text ?? item.label)
      if (!label) return ''
      const done = item.done === true ? 'true' : 'false'
      return `<item done="${done}">\n${escapeMdxText(label)}\n</item>`
    })
    .filter(Boolean)
    .join('\n')
  return `<checklist${attrList(entryAttrs('checklist', data))}>\n${items}\n</checklist>`
}

function workflowMdx(data: Record<string, unknown>): string {
  return `<workflow${attrList(entryAttrs('workflow', data))}>\n\`\`\`workflow\n${workflowTable(data)}\n\`\`\`\n</workflow>`
}

function workflowHtml(data: Record<string, unknown>): string {
  const links = records(data.nodes)
    .map((node) => {
      const id = text(node.id)
      if (!id) return ''
      const ref = text(node.ref) || id
      const label = text(node.label) || id
      return `<a class="workflow-step" href="#plan-${escapeHtml(ref)}" data-plan-jump="${escapeHtml(ref)}">${escapeHtml(label)}</a>`
    })
    .filter(Boolean)
    .join('\n')
  const id = text(data.id)
  const title = text(data.title) || 'Expected execution'
  return `<section class="block plan-entry plan-workflow"${id ? ` id="plan-${escapeHtml(id)}"` : ''} data-entry="workflow"><h3 class="plan-title">${escapeHtml(title)}</h3>${links}</section>`
}

function workflowTable(data: Record<string, unknown>): string {
  const nodes = records(data.nodes)
    .map((node) => {
      const id = text(node.id)
      const label = text(node.label)
      if (!id || !label) return ''
      const ref = text(node.ref) || id
      const detail = text(node.detail)
      return detail ? `${id} | ${label} | ${ref} | ${detail}` : `${id} | ${label} | ${ref}`
    })
    .filter(Boolean)
  const edges = records(data.edges)
    .map((edge) => {
      const from = text(edge.from)
      const to = text(edge.to)
      if (!from || !to) return ''
      const fromSide = text(edge.fromSide)
      const toSide = text(edge.toSide)
      const sides = fromSide && toSide ? ` @ ${fromSide}>${toSide}` : ''
      const label = text(edge.label)
      return `${from} -> ${to}${sides}${label ? ` | ${label}` : ''}`
    })
    .filter(Boolean)
  return `${nodes.join('\n')}\n--\n${edges.join('\n')}`
}

function choiceHtml(data: Record<string, unknown>): string {
  const id = text(data.id)
  const buttons = records(data.options)
    .map((option) => {
      const optionId = text(option.id)
      const label = text(option.label)
      if (!optionId || !label || !id) return ''
      return `<button type="button" data-choice-id="${escapeHtml(id)}" data-option-id="${escapeHtml(optionId)}" data-option-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`
    })
    .join('')
  return `${buttons}<p class="plan-state" data-state-for="${escapeHtml(id)}">Waiting for a selection</p>`
}

function formHtml(data: Record<string, unknown>): string {
  const id = text(data.id)
  const fields = records(data.fields)
    .map((field) => {
      const name = text(field.name)
      if (!name) return ''
      return `<input name="${escapeHtml(name)}" />`
    })
    .join('')
  return `<form data-form-id="${escapeHtml(id)}">${fields}<p class="plan-state" data-state-for="${escapeHtml(id)}">Waiting for form values</p></form>`
}

function questionsHtml(data: Record<string, unknown>): string {
  const id = text(data.id)
  const fields = stringList(data.items)
    .map((_, index) => `<textarea name="${index}"></textarea>`)
    .join('')
  return `<form data-questions-id="${escapeHtml(id)}">${fields}<p class="plan-state" data-state-for="${escapeHtml(id)}">Waiting for answers</p></form>`
}

function checklistHtml(data: Record<string, unknown>): string {
  return records(data.items)
    .map((item) => {
      const label = text(item.text ?? item.label)
      return label ? `<li>${escapeHtml(label)}</li>` : ''
    })
    .join('')
}

function approveHtml(data: Record<string, unknown>): string {
  const id = text(data.id)
  return `<p class="plan-state" data-state-for="${escapeHtml(id)}">Waiting for approval</p>`
}

function proseToMdx(text: string): string {
  return convertTags(text, tagToMdx)
}

function proseToHtml(text: string): string {
  const converted = convertTags(text, tagToHtml)
  return converted
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim()
      if (!trimmed) return ''
      if (trimmed.startsWith('<')) return trimmed
      if (/^#{1,6}\s+/.test(trimmed)) {
        const level = Math.min(6, trimmed.match(/^#+/)?.[0].length ?? 1)
        const label = trimmed.replace(/^#{1,6}\s+/, '')
        return `<h${level}>${escapeHtml(label)}</h${level}>`
      }
      if (trimmed.includes('\n') && trimmed.split('\n').every((line) => /^[-*]\s+/.test(line.trim()))) {
        const items = trimmed
          .split('\n')
          .map((line) => `<li>${escapeHtml(line.replace(/^[-*]\s+/, ''))}</li>`)
          .join('')
        return `<ul>${items}</ul>`
      }
      return `<p>${escapeHtml(trimmed)}</p>`
    })
    .filter(Boolean)
    .join('\n')
}

function tagToMdx(name: string, attrs: Record<string, string>, inner: string, selfClosing: boolean): string {
  if (name === 'status') {
    const status = attrs.status ?? ''
    return `<span className="status-chip status-${escapeAttr(status)}">${escapeHtml(status)}</span>`
  }
  const rendered = attrList(attrs)
  if (selfClosing) return `<${name}${rendered} />`
  return `<${name}${rendered}>\n${convertTags(inner, tagToMdx)}\n</${name}>`
}

function tagToHtml(name: string, attrs: Record<string, string>, inner: string, selfClosing: boolean): string {
  if (name === 'status') {
    const status = attrs.status ?? ''
    return `<span class="status-chip status-${escapeHtml(status)}">${escapeHtml(status)}</span>`
  }
  if (selfClosing) return ''
  const id = attrs.id ? ` id="plan-${escapeHtml(attrs.id)}"` : ''
  const title = attrs.title || attrs.prompt || attrs.label || ''
  const heading = title ? `<h3 class="plan-title">${escapeHtml(title)}</h3>` : ''
  return `<section class="block plan-entry"${id}>${heading}${proseToHtml(inner)}</section>`
}

function convertTags(
  source: string,
  emit: (name: string, attrs: Record<string, string>, inner: string, selfClosing: boolean) => string,
): string {
  let cursor = 0
  let out = ''
  while (cursor < source.length) {
    const fence = source.indexOf('```', cursor)
    const tag = source.indexOf('{%', cursor)
    if (tag < 0 || (fence >= 0 && fence < tag)) {
      if (fence < 0) {
        out += source.slice(cursor)
        break
      }
      const close = source.indexOf('```', fence + 3)
      const end = close < 0 ? source.length : close + 3
      out += source.slice(cursor, end)
      cursor = end
      continue
    }
    out += source.slice(cursor, tag)
    const end = source.indexOf('%}', tag + 2)
    if (end < 0) {
      out += source.slice(tag)
      break
    }
    const inside = source.slice(tag + 2, end).trim()
    const selfClosing = /\/\s*$/.test(inside)
    const header = selfClosing ? inside.replace(/\/\s*$/, '').trim() : inside
    const name = header.split(/\s+/)[0] ?? ''
    const attrs = parseAttrs(header.slice(name.length))
    if (!name) {
      out += source.slice(tag, end + 2)
      cursor = end + 2
      continue
    }
    if (selfClosing) {
      out += emit(name, attrs, '', true)
      cursor = end + 2
      continue
    }
    const close = findClose(source, end + 2, name)
    if (!close) {
      out += source.slice(tag, end + 2)
      cursor = end + 2
      continue
    }
    out += emit(name, attrs, source.slice(end + 2, close.start), false)
    cursor = close.end
  }
  return out
}

function findClose(source: string, from: number, name: string): { start: number; end: number } | null {
  const open = new RegExp(`\\{%\\s*${name}\\b[^%]*?(?<!/)\\s*%\\}`, 'g')
  const close = new RegExp(`\\{%\\s*/\\s*${name}\\s*%\\}`, 'g')
  let depth = 1
  let cursor = from
  while (cursor < source.length) {
    open.lastIndex = cursor
    close.lastIndex = cursor
    const nextOpen = open.exec(source)
    const nextClose = close.exec(source)
    if (!nextClose) return null
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1
      cursor = nextOpen.index + nextOpen[0].length
      continue
    }
    depth -= 1
    if (depth === 0) return { start: nextClose.index, end: nextClose.index + nextClose[0].length }
    cursor = nextClose.index + nextClose[0].length
  }
  return null
}

function parseAttrs(input: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const match of input.matchAll(/([A-Za-z_][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g)) {
    const key = match[1]
    if (!key) continue
    attrs[key] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attrs
}

function attrList(attrs: Record<string, string>): string {
  const parts = Object.entries(attrs)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}="${escapeAttr(value)}"`)
  return parts.length > 0 ? ` ${parts.join(' ')}` : ''
}

function escapeMdxText(text: string): string {
  const parts = text.split(/(```[\s\S]*?```)/g)
  return parts
    .map((part, index) => (index % 2 === 1 ? part : part.replace(/\{/g, '\\{').replace(/</g, '&lt;')))
    .join('')
}

function codeHtml(info: string, text: string): string {
  const name = info.split(/\s+/)[0]?.toLowerCase() ?? ''
  const diff = name === 'diff' || name === 'patch' || info.split(/\s+/).includes('diff')
  const lang = diff && (name === 'diff' || name === 'patch') ? '' : name
  const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : ''
  const diffAttr = diff ? ' data-diff="true"' : ''
  return `<pre class="code-block"${langAttr}${diffAttr}><code>${escapeHtml(text)}</code></pre>`
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => text(item)).filter(Boolean)
}

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function dedent(value: string): string {
  const lines = value.replace(/^\n/, '').replace(/\s+$/, '').split('\n')
  const indents = lines.filter((line) => line.trim()).map((line) => /^ */.exec(line)?.[0].length ?? 0)
  const min = indents.length > 0 ? Math.min(...indents) : 0
  return lines.map((line) => line.slice(min)).join('\n')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;')
}
