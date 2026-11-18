/* ----------------------------------------------------------------------------------------------
 * Where a click lands in a block's text, or what a double or triple click selects there, and the same
 * place in the editor that opens on it (ADR 0040). The page and the editor draw the same text with
 * other elements around it, so a place is a count of characters: text, plus one for each line break,
 * leaving out the line breaks between the items of a list or the paragraphs of a quote, which only
 * the page writes.
 * ------------------------------------------------------------------------------------------- */

/** Elements whose own whitespace is layout, not text. */
const STRUCTURE = new Set(['UL', 'OL', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TR'])

/** Parts of a block that are not its text: a checkbox, an icon, the editor's `/` hint. */
const NOT_TEXT = 'input, button, svg, [aria-hidden="true"], [data-slash-hint]'

type Unit = Text | HTMLBRElement

function* textUnits(root: Node): Generator<Unit> {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (node instanceof Element) {
        if (node !== root && node.matches(NOT_TEXT)) return NodeFilter.FILTER_REJECT
        return node instanceof HTMLBRElement ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
      }
      const parent = node.parentElement
      if (parent && STRUCTURE.has(parent.tagName) && !(node.textContent ?? '').trim()) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) yield node as Unit
}

function unitLength(unit: Unit): number {
  return unit instanceof Text ? unit.data.length : 1
}

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}

function caretFromPoint(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as CaretDocument
  if (typeof doc.caretPositionFromPoint === 'function') {
    const position = doc.caretPositionFromPoint(x, y)
    if (position) return { node: position.offsetNode, offset: position.offset }
  }
  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y)
    if (range) return { node: range.startContainer, offset: range.startOffset }
  }
  return null
}

/** How far into `root`'s text the place `offset` into `node` is, or null when that place is not in `root`. */
function textOffsetOf(root: Element, node: Node, offset: number): number | null {
  if (!root.contains(node)) return null
  const before = document.createRange()
  before.setStart(root, 0)
  try {
    before.setEnd(node, offset)
  } catch {
    return null
  }
  let count = 0
  for (const unit of textUnits(root)) {
    if (unit === node) return count + Math.min(offset, unitLength(unit))
    // A unit that ends before the place counts whole; the first one after it ends the count.
    const end = unit instanceof Text ? unit.data.length : 0
    if (before.comparePoint(unit, end) !== 0) break
    count += unitLength(unit)
  }
  return count
}

/** How far into `root`'s text the point is, or null when the point is not over its text. */
export function textOffsetAt(root: Element, x: number, y: number): number | null {
  const caret = caretFromPoint(x, y)
  return caret ? textOffsetOf(root, caret.node, caret.offset) : null
}

/**
 * The part of the page's selection in `root`'s text, as characters from its start: a word a double
 * click selected, or the line a triple click did, which runs on past the text's end. `stop` ends
 * `root` before that child of it. Null when the selection is not in `root`.
 */
export function selectionIn(root: Element, stop?: Node): { start: number; end: number } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  const scope = document.createRange()
  scope.selectNodeContents(root)
  try {
    if (stop) scope.setEndBefore(stop)
    const from = scope.comparePoint(range.startContainer, range.startOffset)
    const to = scope.comparePoint(range.endContainer, range.endOffset)
    if (from > 0 || to < 0) return null
    const start = from < 0 ? 0 : textOffsetOf(root, range.startContainer, range.startOffset)
    const end = to > 0 ? textOffsetOf(root, scope.endContainer, scope.endOffset) : textOffsetOf(root, range.endContainer, range.endOffset)
    return start === null || end === null ? null : { start, end: Math.max(start, end) }
  } catch {
    // The selection is in another document, or `stop` is not in `root`.
    return null
  }
}

/** The place `offset` characters into `root`'s text, or its end when the text is shorter. */
function placeAt(root: Element, offset: number): { node: Node; offset: number } | null {
  let left = Math.max(0, offset)
  let last: Unit | null = null
  for (const unit of textUnits(root)) {
    if (unit instanceof Text) {
      if (left <= unit.data.length) return { node: unit, offset: left }
    } else if (left === 0 && unit.parentNode) {
      return { node: unit.parentNode, offset: Array.prototype.indexOf.call(unit.parentNode.childNodes, unit) }
    }
    left -= unitLength(unit)
    last = unit
  }
  return last instanceof Text ? { node: last, offset: last.data.length } : null
}

/** Put the caret `offset` characters into `root`'s text, or at its end when the text is shorter. */
export function placeCaret(root: Element, offset: number): boolean {
  return placeSelection(root, offset, offset)
}

/** Select `root`'s text from `start` to `end` characters into it: the caret alone when they are the same. */
export function placeSelection(root: Element, start: number, end: number): boolean {
  const selection = window.getSelection()
  if (!selection) return false
  const from = placeAt(root, start)
  const to = end === start ? from : placeAt(root, end)
  if (!from || !to) return false
  selection.setBaseAndExtent(from.node, from.offset, to.node, to.offset)
  return true
}
