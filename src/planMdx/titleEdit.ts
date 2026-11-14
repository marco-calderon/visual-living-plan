import { mdxBodyOffset } from './remarkBlockRanges'

/**
 * A card's title edited where it reads (ADR 0040). A phase, a callout, a checklist, a choice, a
 * form, questions, an approval, and the workflow take their title from an attribute of their
 * opening tag (`title="…"` or `prompt="…"`). The page edits the title's text, and the file changes
 * only inside that attribute's quotes.
 */

/** Where a title's text is in the plan's compiled MDX, and the quote its attribute is written with. */
export type TitleRange = { start: number; end: number; quote: '"' | "'" }

const NAME_CHAR = /[\w.:-]/

/** The index just after the expression that opens at `at` (`{` … `}`), skipping strings in it. */
function skipExpression(text: string, at: number): number {
  let depth = 0
  for (let i = at; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' || char === "'" || char === '`') {
      const close = text.indexOf(char, i + 1)
      if (close < 0) return text.length
      i = close
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return i + 1
    }
  }
  return text.length
}

/**
 * The raw text between the quotes of attribute `name` in the opening tag that starts at `at`
 * (absolute offsets in `text`), or null when the tag has no such attribute written as a string.
 */
export function attributeValueAt(text: string, at: number, name: string): { start: number; end: number; quote: '"' | "'" } | null {
  if (text[at] !== '<') return null
  let i = at + 1
  while (i < text.length && NAME_CHAR.test(text[i]!)) i += 1
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i]!)) i += 1
    const char = text[i]
    if (char === undefined || char === '>' || char === '/') return null
    if (char === '{') {
      i = skipExpression(text, i)
      continue
    }
    const nameStart = i
    while (i < text.length && !/[\s=/>{]/.test(text[i]!)) i += 1
    const attr = text.slice(nameStart, i)
    if (i === nameStart) return null
    while (i < text.length && /\s/.test(text[i]!)) i += 1
    if (text[i] !== '=') continue
    i += 1
    while (i < text.length && /\s/.test(text[i]!)) i += 1
    const quote = text[i]
    if (quote === '"' || quote === "'") {
      const close = text.indexOf(quote, i + 1)
      if (close < 0) return null
      if (attr === name) return { start: i + 1, end: close, quote }
      i = close + 1
      continue
    }
    if (quote === '{') {
      i = skipExpression(text, i)
      continue
    }
    return null
  }
  return null
}

/**
 * Where the title the page shows (`shown`) is in the attribute `name` of the block at `block` (its
 * `data-plan-block`). A phase shows its title without a leading step number ("3. "), so the place is
 * the part of the value the page shows. Null when the attribute is missing, is not a plain string,
 * or holds character references the page decoded.
 */
export function titleRange(source: string, block: { start: number; end: number }, name: string, shown: string): TitleRange | null {
  const offset = mdxBodyOffset(source)
  const value = attributeValueAt(source, offset + block.start, name)
  if (!value || value.end > offset + block.end) return null
  const raw = source.slice(value.start, value.end)
  const text = shown.trim()
  if (!text) return null
  const at = raw === text ? 0 : raw.lastIndexOf(text)
  if (at < 0) return null
  return { start: value.start - offset + at, end: value.start - offset + at + text.length, quote: value.quote }
}

/** A title as attribute text: one line, with its quote and anything that reads as a character reference escaped. */
export function titleAttributeText(text: string, quote: '"' | "'"): string {
  return text
    .replace(/ /g, ' ')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .trim()
    .replace(/&(?=#?\w+;)/g, '&amp;')
    .replace(quote === '"' ? /"/g : /'/g, quote === '"' ? '&quot;' : '&#39;')
}

/** The plan file with the title at `range` written as `text`. Every other byte stays. An empty title keeps the file as it was. */
export function applyTitleEdit(source: string, range: TitleRange, text: string): string {
  const next = titleAttributeText(text, range.quote)
  if (!next) return source
  const offset = mdxBodyOffset(source)
  return `${source.slice(0, offset + range.start)}${next}${source.slice(offset + range.end)}`
}
