/**
 * Markdoc splits table rows on `|` and only honors a backslash escape.
 * A pipe inside inline code (`foo | bar`) has to be escaped before that split,
 * or the cell breaks. The escape is applied to a parse copy; section text stays
 * the source the author wrote.
 */

function escapedSplit(str: string): string[] {
  const result: string[] = []
  const max = str.length
  let pos = 0
  let ch = str.charCodeAt(pos)
  let isEscaped = false
  let lastPos = 0
  let current = ''
  while (pos < max) {
    if (ch === 124) {
      if (!isEscaped) {
        result.push(current + str.substring(lastPos, pos))
        current = ''
        lastPos = pos + 1
      } else {
        current += str.substring(lastPos, pos - 1)
        lastPos = pos
      }
    }
    isEscaped = ch === 92
    pos++
    ch = str.charCodeAt(pos)
  }
  result.push(current + str.substring(lastPos))
  return result
}

function columnCount(line: string): number {
  const columns = escapedSplit(line.trim())
  if (columns.length && columns[0] === '') columns.shift()
  if (columns.length && columns[columns.length - 1] === '') columns.pop()
  return columns.length
}

function separatorCount(line: string): number {
  const columns = line.trim().split('|')
  const aligns: string[] = []
  for (let i = 0; i < columns.length; i++) {
    const cell = columns[i]?.trim() ?? ''
    if (!cell) {
      if (i === 0 || i === columns.length - 1) continue
      return 0
    }
    if (!/^:?-+:?$/.test(cell)) return 0
    aligns.push(cell)
  }
  return aligns.length
}

function fenceMask(lines: string[]): boolean[] {
  const inside = lines.map(() => false)
  let open: { marker: string; len: number } | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line)
    if (match) {
      const marker = match[2]?.[0] ?? ''
      const len = match[2]?.length ?? 0
      const info = match[3] ?? ''
      if (!open) {
        if (!(marker === '`' && info.includes('`'))) {
          open = { marker, len }
          inside[i] = true
          continue
        }
      } else if (open.marker === marker && len >= open.len && info.trim() === '') {
        inside[i] = true
        open = null
        continue
      }
    }
    if (open) inside[i] = true
  }
  return inside
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

function tableLines(lines: string[], insideFence: boolean[]): boolean[] {
  const table = lines.map(() => false)
  for (let i = 0; i < lines.length - 1; i++) {
    if (insideFence[i] || insideFence[i + 1]) continue
    const header = lines[i] ?? ''
    if (!header.includes('|')) continue
    const columns = columnCount(header)
    const separator = separatorCount(lines[i + 1] ?? '')
    if (columns === 0 || columns !== separator) continue
    table[i] = true
    table[i + 1] = true
    for (let row = i + 2; row < lines.length; row++) {
      if (insideFence[row] || endsTable(lines[row] ?? '')) break
      table[row] = true
    }
  }
  return table
}

function escapeCodePipes(line: string): string {
  let out = ''
  let i = 0
  while (i < line.length) {
    if (line[i] !== '`') {
      out += line[i]
      i++
      continue
    }
    let len = 0
    while (line[i + len] === '`') len++
    const marker = '`'.repeat(len)
    const closer = findCloser(line, i + len, marker)
    if (closer === -1) {
      out += line[i]
      i++
      continue
    }
    const inner = line.slice(i + len, closer).replace(/(?<!\\)\|/g, '\\|')
    out += marker + inner + marker
    i = closer + len
  }
  return out
}

function findCloser(line: string, from: number, marker: string): number {
  let pos = from
  while (pos < line.length) {
    const at = line.indexOf(marker, pos)
    if (at === -1) return -1
    const before = at > 0 && line[at - 1] === '`'
    const after = line[at + marker.length] === '`'
    if (!before && !after) return at
    pos = at + 1
  }
  return -1
}

export function protectTableCodePipes(source: string): string {
  const lines = source.split('\n')
  const insideFence = fenceMask(lines)
  const table = tableLines(lines, insideFence)
  let changed = false
  const next = lines.map((line, index) => {
    if (!table[index] || !line.includes('`') || !line.includes('|')) return line
    const escaped = escapeCodePipes(line)
    if (escaped !== line) changed = true
    return escaped
  })
  return changed ? next.join('\n') : source
}
