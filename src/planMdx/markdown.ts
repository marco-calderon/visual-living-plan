/**
 * Static HTML for plan prose: headings, lists, tables, mermaid figures, and code.
 * The open page replaces this with compiled MDX. Part ids match the comment targets.
 */

type Align = 'left' | 'center' | 'right'

type PartCounts = {
  heading: number
  paragraph: number
  'list-item': number
  diagram: number
  code: number
}

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; info: string; content: string }
  | { type: 'table'; aligns: Align[]; header: string[]; rows: string[][] }
  | { type: 'list'; ordered: boolean; start: number; loose: boolean; items: string[][] }
  | { type: 'quote'; text: string }
  | { type: 'hr' }

export function renderPlanMarkdown(source: string, scope: string): string {
  const counts: PartCounts = { heading: 0, paragraph: 0, 'list-item': 0, diagram: 0, code: 0 }
  return parseBlocks(source.replace(/\r\n/g, '\n'))
    .map((block) => renderBlock(block, scope, counts))
    .filter((html) => html.length > 0)
    .join('\n')
}

function parseBlocks(source: string): Block[] {
  const lines = source.split('\n')
  const blocks: Block[] = []
  let index = 0
  while (index < lines.length) {
    if ((lines[index] ?? '').trim() === '') {
      index += 1
      continue
    }
    const fence = readFence(lines, index)
    if (fence) {
      blocks.push({ type: 'code', info: fence.info, content: fence.content })
      index = fence.next
      continue
    }
    const table = readTable(lines, index)
    if (table) {
      blocks.push(table.block)
      index = table.next
      continue
    }
    const heading = /^( {0,3})(#{1,6})(?:\s+(.*))?$/.exec(lines[index] ?? '')
    if (heading && (heading[3] !== undefined || (heading[2] ?? '').length > 0)) {
      const level = (heading[2] ?? '#').length
      blocks.push({ type: 'heading', level, text: (heading[3] ?? '').trim() })
      index += 1
      continue
    }
    if (/^ {0,3}(?:>\s?)/.test(lines[index] ?? '')) {
      const quote = readQuote(lines, index)
      blocks.push({ type: 'quote', text: quote.text })
      index = quote.next
      continue
    }
    if (listMarker(lines[index] ?? '')) {
      const list = readList(lines, index)
      blocks.push(list.block)
      index = list.next
      continue
    }
    if (/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(lines[index] ?? '')) {
      blocks.push({ type: 'hr' })
      index += 1
      continue
    }
    const paragraph = readParagraph(lines, index)
    blocks.push({ type: 'paragraph', text: paragraph.text })
    index = paragraph.next
  }
  return blocks
}

function renderBlock(block: Block, scope: string, counts: PartCounts): string {
  if (block.type === 'heading') {
    counts.heading += 1
    return `<h${block.level}${partAttrs(scope, 'heading', counts.heading)}>${renderInline(block.text)}</h${block.level}>`
  }
  if (block.type === 'paragraph') {
    counts.paragraph += 1
    return `<p${partAttrs(scope, 'paragraph', counts.paragraph)}>${renderInline(block.text)}</p>`
  }
  if (block.type === 'quote') {
    counts.paragraph += 1
    return `<blockquote><p${partAttrs(scope, 'paragraph', counts.paragraph)}>${renderInline(block.text)}</p></blockquote>`
  }
  if (block.type === 'hr') return '<hr>'
  if (block.type === 'code') return renderFence(block.info, block.content, scope, counts)
  if (block.type === 'table') return renderTable(block)
  return renderList(block, scope, counts)
}

function renderFence(info: string, content: string, scope: string, counts: PartCounts): string {
  const parts = fenceParts(info)
  const body = escapeHtml(content)
  if (parts.language === 'mermaid' && !parts.diff && content.trim()) {
    counts.diagram += 1
    return `<figure class="mermaid-diagram"${partAttrs(scope, 'diagram', counts.diagram)}><pre class="mermaid">${body}</pre></figure>`
  }
  counts.code += 1
  const attrs = [`class="code-block"`, partAttr(scope, 'code', counts.code)]
  if (parts.language) attrs.push(`data-lang="${escapeAttr(parts.language)}"`)
  if (!parts.diff && parts.start >= 1) attrs.push(`data-start="${parts.start}"`)
  if (parts.diff) attrs.push(`data-diff="true"`)
  return `<pre ${attrs.join(' ')}><code>${body}</code></pre>`
}

function renderTable(block: Extract<Block, { type: 'table' }>): string {
  const head = block.header
    .map((cell, index) => cellTag('th', block.aligns[index] ?? 'left', cell))
    .join('')
  const body =
    block.rows.length === 0
      ? ''
      : `<tbody>${block.rows
          .map(
            (row) =>
              `<tr>${row.map((cell, index) => cellTag('td', block.aligns[index] ?? 'left', cell)).join('')}</tr>`,
          )
          .join('')}</tbody>`
  return `<div class="rich-table"><table><thead><tr>${head}</tr></thead>${body}</table></div>`
}

function cellTag(tag: 'th' | 'td', align: Align, cell: string): string {
  const className = align === 'center' ? ' class="align-center"' : align === 'right' ? ' class="align-right"' : ''
  return `<${tag}${className}>${renderInline(unescapePipes(cell.trim()))}</${tag}>`
}

function renderList(block: Extract<Block, { type: 'list' }>, scope: string, counts: PartCounts): string {
  const items = block.items
    .map((paragraphs) => {
      counts['list-item'] += 1
      const inner = block.loose
        ? paragraphs
            .map((paragraph) => {
              counts.paragraph += 1
              return `<p${partAttrs(scope, 'paragraph', counts.paragraph)}>${renderInline(paragraph)}</p>`
            })
            .join('')
        : renderInline(paragraphs.join(' '))
      return `<li${partAttrs(scope, 'list-item', counts['list-item'])}>${inner}</li>`
    })
    .join('')
  const start = block.ordered && block.start > 1 ? ` start="${block.start}"` : ''
  const tag = block.ordered ? 'ol' : 'ul'
  return `<${tag}${start}>${items}</${tag}>`
}

function partAttrs(scope: string, kind: string, index: number): string {
  return ` ${partAttr(scope, kind, index)}`
}

function partAttr(scope: string, kind: string, index: number): string {
  return `data-plan-part="${scope}/${kind}:${index}" data-plan-kind="${kind}"`
}

function fenceParts(info: string): { language: string; diff: boolean; start: number } {
  let language = ''
  let diff = false
  let start = 0
  for (const raw of info.split(/\s+/)) {
    if (!raw) continue
    const token = raw.toLowerCase()
    if (token === 'diff' || token === 'patch') {
      diff = true
      continue
    }
    const startMatch = /^start=(\d+)$/i.exec(raw)
    if (startMatch) {
      const value = Number(startMatch[1])
      if (value >= 1) start = value
      continue
    }
    if (!language) language = token
  }
  return { language, diff, start }
}

function readFence(lines: string[], at: number): { info: string; content: string; next: number } | null {
  const open = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(lines[at] ?? '')
  if (!open) return null
  const marker = open[2] ?? ''
  const info = (open[3] ?? '').trim()
  if (marker.startsWith('`') && info.includes('`')) return null
  const content: string[] = []
  let index = at + 1
  while (index < lines.length) {
    const close = /^( {0,3})(`{3,}|~{3,})\s*$/.exec(lines[index] ?? '')
    const closeMarker = close?.[2] ?? ''
    if (close && closeMarker[0] === marker[0] && closeMarker.length >= marker.length) {
      return { info, content: content.join('\n'), next: index + 1 }
    }
    content.push(lines[index] ?? '')
    index += 1
  }
  return { info, content: content.join('\n'), next: lines.length }
}

function readTable(lines: string[], at: number): { block: Extract<Block, { type: 'table' }>; next: number } | null {
  const headerLine = lines[at] ?? ''
  const separatorLine = lines[at + 1] ?? ''
  if (!headerLine.includes('|')) return null
  const header = splitCells(headerLine)
  const aligns = separatorAligns(separatorLine)
  if (!aligns || header.length === 0 || header.length !== aligns.length) return null
  const rows: string[][] = []
  let index = at + 2
  while (index < lines.length && !endsTable(lines[index] ?? '')) {
    const cells = splitCells(lines[index] ?? '').slice(0, header.length)
    while (cells.length < header.length) cells.push('')
    rows.push(cells)
    index += 1
  }
  return { block: { type: 'table', aligns, header, rows }, next: index }
}

function endsTable(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (/^#{1,6}(\s|$)/.test(trimmed)) return true
  if (/^(`{3,}|~{3,})/.test(trimmed)) return true
  if (/^(?:[-*+]|\d+[.)])\s/.test(trimmed)) return true
  if (trimmed.startsWith('>')) return true
  if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return true
  if (trimmed.startsWith('{%')) return true
  if (/^<\/?[A-Za-z]/.test(trimmed)) return true
  return false
}

function separatorAligns(line: string): Align[] | null {
  const cells = splitCells(line)
  if (cells.length === 0) return null
  const aligns: Align[] = []
  for (const cell of cells) {
    const trimmed = cell.trim()
    const match = /^(:)?-+(:)?$/.exec(trimmed)
    if (!match) return null
    const left = match[1] === ':'
    const right = match[2] === ':'
    aligns.push(left && right ? 'center' : right ? 'right' : 'left')
  }
  return aligns
}

function splitCells(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let index = 0
  while (index < line.length) {
    if (line[index] === '\\' && line[index + 1] === '|') {
      current += '\\|'
      index += 2
      continue
    }
    if (line[index] === '`') {
      const span = codeSpanEnd(line, index)
      if (span > index) {
        current += line.slice(index, span)
        index = span
        continue
      }
    }
    if (line[index] === '|') {
      cells.push(current)
      current = ''
      index += 1
      continue
    }
    current += line[index]
    index += 1
  }
  cells.push(current)
  if (cells.length > 0 && (cells[0] ?? '').trim() === '') cells.shift()
  if (cells.length > 0 && (cells[cells.length - 1] ?? '').trim() === '') cells.pop()
  return cells
}

function unescapePipes(value: string): string {
  return value.replace(/\\\|/g, '|')
}

function readParagraph(lines: string[], at: number): { text: string; next: number } {
  const parts: string[] = []
  let index = at
  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (line.trim() === '' || isBlockStart(line, lines[index + 1])) break
    parts.push(line.trim())
    index += 1
  }
  return { text: parts.join(' '), next: index }
}

function readQuote(lines: string[], at: number): { text: string; next: number } {
  const parts: string[] = []
  let index = at
  while (index < lines.length && /^ {0,3}>\s?/.test(lines[index] ?? '')) {
    parts.push((lines[index] ?? '').replace(/^ {0,3}>\s?/, '').trim())
    index += 1
  }
  return { text: parts.join(' '), next: index }
}

function readList(lines: string[], at: number): { block: Extract<Block, { type: 'list' }>; next: number } {
  const first = listMarker(lines[at] ?? '')
  const ordered = first?.ordered ?? false
  const start = first?.start ?? 1
  const items: string[][] = []
  let loose = false
  let newParagraph = false
  let index = at
  while (index < lines.length) {
    const line = lines[index] ?? ''
    const marker = listMarker(line)
    if (marker && marker.ordered === ordered) {
      items.push([marker.text])
      newParagraph = false
      index += 1
      continue
    }
    if (line.trim() === '') {
      const next = lines[index + 1] ?? ''
      const nextMarker = listMarker(next)
      if ((nextMarker && nextMarker.ordered === ordered) || (/^ {2,}\S/.test(next) && items.length > 0)) {
        loose = true
        newParagraph = true
        index += 1
        continue
      }
      break
    }
    const item = items[items.length - 1]
    if (item && /^\s+\S/.test(line) && !isBlockStart(line.trim(), lines[index + 1])) {
      const text = line.trim()
      if (newParagraph) item.push(text)
      else item[item.length - 1] = `${item[item.length - 1]} ${text}`
      newParagraph = false
      index += 1
      continue
    }
    break
  }
  return { block: { type: 'list', ordered, start, loose, items }, next: index }
}

function listMarker(line: string): { ordered: boolean; start: number; text: string } | null {
  const match = /^( {0,3})([-*+]|\d{1,9}[.)])\s+(.*)$/.exec(line)
  if (!match) return null
  const bullet = match[2] ?? '-'
  const ordered = /\d/.test(bullet)
  const start = ordered ? Number.parseInt(bullet, 10) : 1
  return { ordered, start, text: match[3] ?? '' }
}

function isBlockStart(line: string, next: string | undefined): boolean {
  if (/^ {0,3}#{1,6}(\s|$)/.test(line)) return true
  if (/^ {0,3}(`{3,}|~{3,})/.test(line)) return true
  if (/^ {0,3}>/.test(line)) return true
  if (listMarker(line)) return true
  if (/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return true
  if (next && line.includes('|')) {
    const header = splitCells(line)
    const aligns = separatorAligns(next)
    if (aligns && header.length > 0 && header.length === aligns.length) return true
  }
  return false
}

function renderInline(text: string): string {
  let html = ''
  let index = 0
  while (index < text.length) {
    if (text[index] === '`') {
      const end = codeSpanEnd(text, index)
      if (end > index) {
        const marker = /^`+/.exec(text.slice(index))?.[0].length ?? 1
        const raw = text.slice(index + marker, end - marker)
        html += `<code>${escapeHtml(unescapePipes(raw))}</code>`
        index = end
        continue
      }
    }
    if (text[index] === '[') {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(text.slice(index))
      if (link) {
        html += `<a href="${escapeAttr(link[2] ?? '')}">${renderInline(link[1] ?? '')}</a>`
        index += link[0].length
        continue
      }
    }
    if (text.startsWith('**', index) || text.startsWith('__', index)) {
      const marker = text.slice(index, index + 2)
      const end = text.indexOf(marker, index + 2)
      if (end > index + 2) {
        html += `<strong>${renderInline(text.slice(index + 2, end))}</strong>`
        index = end + 2
        continue
      }
    }
    if ((text[index] === '*' || text[index] === '_') && canOpenEmphasis(text, index)) {
      const marker = text[index] ?? '*'
      const end = findEmphasisEnd(text, index + 1, marker)
      if (end > index + 1) {
        html += `<em>${renderInline(text.slice(index + 1, end))}</em>`
        index = end + 1
        continue
      }
    }
    html += escapeHtml(text[index] ?? '')
    index += 1
  }
  return html
}

function canOpenEmphasis(text: string, index: number): boolean {
  const marker = text[index]
  const prev = index > 0 ? text[index - 1] : ''
  if (marker === '_' && prev && /[\p{L}\p{N}_]/u.test(prev)) return false
  if (text[index + 1] === undefined || text[index + 1] === ' ') return false
  return true
}

function findEmphasisEnd(text: string, from: number, marker: string): number {
  for (let index = from; index < text.length; index += 1) {
    if (text[index] !== marker) continue
    if (text[index + 1] === marker) continue
    const prev = text[index - 1]
    if (prev === ' ') continue
    if (marker === '_' && text[index + 1] && /[\p{L}\p{N}_]/u.test(text[index + 1] ?? '')) continue
    return index
  }
  return -1
}

function codeSpanEnd(text: string, at: number): number {
  let length = 0
  while (text[at + length] === '`') length += 1
  if (length === 0) return at
  const marker = '`'.repeat(length)
  let pos = at + length
  while (pos < text.length) {
    const found = text.indexOf(marker, pos)
    if (found < 0) return at
    const before = found > 0 && text[found - 1] === '`'
    const after = text[found + length] === '`'
    if (!before && !after) return found + length
    pos = found + 1
  }
  return at
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;')
}
