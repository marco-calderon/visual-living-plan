/* ----------------------------------------------------------------------------------------------
 * Where a click lands in a block's text, and the same place in the editor that opens on it (ADR
 * 0040). The page and the editor draw the same text with other elements around it, so a place is a
 * count of characters: text, plus one for each line break, leaving out the line breaks between the
 * items of a list or the paragraphs of a quote, which only the page writes.
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

/** How far into `root`'s text the point is, or null when the point is not over its text. */
export function textOffsetAt(root: Element, x: number, y: number): number | null {
  const caret = caretFromPoint(x, y)
  if (!caret || !root.contains(caret.node)) return null
  const before = document.createRange()
  before.setStart(root, 0)
  try {
    before.setEnd(caret.node, caret.offset)
  } catch {
    return null
  }
  let count = 0
  for (const unit of textUnits(root)) {
    if (unit === caret.node) return count + Math.min(caret.offset, unitLength(unit))
    // A unit that ends before the caret counts whole; the first one after it ends the count.
    const end = unit instanceof Text ? unit.data.length : 0
    if (before.comparePoint(unit, end) !== 0) break
    count += unitLength(unit)
  }
  return count
}

/** Put the caret `offset` characters into `root`'s text, or at its end when the text is shorter. */
export function placeCaret(root: Element, offset: number): boolean {
  const selection = window.getSelection()
  if (!selection) return false
  let left = Math.max(0, offset)
  let last: Unit | null = null
  for (const unit of textUnits(root)) {
    if (unit instanceof Text) {
      if (left <= unit.data.length) {
        selection.collapse(unit, left)
        return true
      }
    } else if (left === 0 && unit.parentNode) {
      selection.collapse(unit.parentNode, Array.prototype.indexOf.call(unit.parentNode.childNodes, unit))
      return true
    }
    left -= unitLength(unit)
    last = unit
  }
  if (last instanceof Text) {
    selection.collapse(last, last.data.length)
    return true
  }
  return false
}
