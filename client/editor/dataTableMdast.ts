import type { Paragraph, PhrasingContent, Text } from 'mdast'
import type { MdxJsxAttribute, MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx'
import type { Handle, State } from 'mdast-util-to-markdown'

/**
 * A `<DataTable>` as the table editor sees it (client/editor/dataTableEditor.tsx): its columns,
 * its rows, and each cell's content, read from and written back to the markdown tree the editor
 * holds. Every change returns a new tree and keeps what it does not touch: attributes, a cell's
 * `value`, markdown and tags inside cells, and the way the file wrote each part.
 *
 * MDX writes a part two ways. A tag alone on its lines is a flow element (`<Column ... />`,
 * `<Row>`, a cell over several lines, `<Cell />`). A tag with text on its line is a text element
 * in a paragraph, and consecutive one-line cells share one paragraph:
 * `<Cell>a</Cell>\n<Cell value="x"><Pill>x</Pill></Cell>`. Both read the same here.
 */

export type JsxElement = MdxJsxFlowElement | MdxJsxTextElement
type Block = MdxJsxFlowElement['children'][number]
type Container = { children: unknown[] }

export type ColumnFlag = 'search' | 'sort' | 'filter'
export const COLUMN_FLAGS: readonly ColumnFlag[] = ['search', 'sort', 'filter']

export type DataTableColumn = {
  /** The `id` the file gives, or the one the page derives from the header. */
  id: string
  /** The `header` attribute, or the column's text when it has no header attribute. */
  header: string
  search: boolean
  sort: boolean
  filter: boolean
}

export type DataTableShape = {
  label: string
  columns: DataTableColumn[]
  /** How many cells each row has, in order. A row can have fewer or more cells than columns. */
  rows: number[]
}

/** Where a part sits in its parent: a child, or a tag on a line of text in one of its paragraphs. */
type Slot = { at: number; inline?: number }

function isJsx(node: unknown): node is JsxElement {
  const type = (node as { type?: unknown } | null)?.type
  return type === 'mdxJsxFlowElement' || type === 'mdxJsxTextElement'
}

function isNamed(node: unknown, name: string): node is JsxElement {
  return isJsx(node) && node.name === name
}

function isParagraph(node: unknown): node is Paragraph {
  return (node as { type?: unknown } | null)?.type === 'paragraph'
}

function isBlankText(node: unknown): boolean {
  return (node as { type?: unknown } | null)?.type === 'text' && /^\s*$/.test((node as Text).value)
}

/** A paragraph that only lists tags, one per line, such as the cells of a row. */
function isTagLine(node: unknown): node is Paragraph {
  return isParagraph(node) && node.children.some(isJsx) && node.children.every((child) => isJsx(child) || isBlankText(child))
}

function slots(parent: Container, name: string): Slot[] {
  const found: Slot[] = []
  parent.children.forEach((child, at) => {
    if (isNamed(child, name)) found.push({ at })
    else if (isParagraph(child)) {
      child.children.forEach((inline, index) => {
        if (isNamed(inline, name)) found.push({ at, inline: index })
      })
    }
  })
  return found
}

function nodeAt(parent: Container, slot: Slot): JsxElement {
  const child = parent.children[slot.at]
  return (slot.inline === undefined ? child : (child as Paragraph).children[slot.inline]) as JsxElement
}

const columnSlots = (table: JsxElement) => slots(table, 'Column')
const rowSlots = (table: JsxElement) => slots(table, 'Row')
const cellSlots = (row: JsxElement) => slots(row, 'Cell')

function attribute(node: JsxElement, name: string): MdxJsxAttribute | undefined {
  return node.attributes.find((item): item is MdxJsxAttribute => item.type === 'mdxJsxAttribute' && item.name === name)
}

/** An attribute as text: `""` when it is missing, the expression's source for `{...}`. */
export function attributeText(node: JsxElement, name: string): string {
  const found = attribute(node, name)
  if (!found || found.value === null || found.value === undefined) return ''
  return typeof found.value === 'string' ? found.value : found.value.value
}

/** On for a bare attribute (`sort`), `"true"`, `""`, or `{true}`, as the page reads them. */
function flagOn(node: JsxElement, name: string): boolean {
  const found = attribute(node, name)
  if (!found) return false
  if (found.value === null || found.value === undefined) return true
  const text = (typeof found.value === 'string' ? found.value : found.value.value).trim()
  return text === '' || text === 'true'
}

/**
 * Set an attribute's text in place, so the file keeps its order. Empty text keeps an attribute the
 * tag already had (as `""`) and adds none.
 */
function setAttribute(node: JsxElement, name: string, value: string): void {
  const index = node.attributes.findIndex((item) => item.type === 'mdxJsxAttribute' && item.name === name)
  if (index >= 0) node.attributes[index] = { type: 'mdxJsxAttribute', name, value }
  else if (value !== '') node.attributes.push({ type: 'mdxJsxAttribute', name, value })
}

function removeAttribute(node: JsxElement, name: string): void {
  node.attributes = node.attributes.filter((item) => !(item.type === 'mdxJsxAttribute' && item.name === name))
}

/** A flag on: written bare (`search`), as the docs write it. A flag that is already on stays as written. */
function setFlag(node: JsxElement, name: string, on: boolean): void {
  if (!on) {
    removeAttribute(node, name)
    return
  }
  if (flagOn(node, name)) return
  const index = node.attributes.findIndex((item) => item.type === 'mdxJsxAttribute' && item.name === name)
  const bare: MdxJsxAttribute = { type: 'mdxJsxAttribute', name, value: null }
  if (index >= 0) node.attributes[index] = bare
  else node.attributes.push(bare)
}

/** Markdown that sits inside a line of text. Anything else with children is a block of its own. */
const INLINE = new Set(['emphasis', 'strong', 'delete', 'link', 'linkReference', 'mdxJsxTextElement'])

/** The text a reader sees in some markdown, on one line. */
export function visibleText(nodes: readonly unknown[]): string {
  const parts: string[] = []
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const { type = '', value, children } = node as { type?: string; value?: unknown; children?: unknown[] }
    if ((type === 'text' || type === 'inlineCode') && typeof value === 'string') parts.push(value)
    if (type === 'break') parts.push(' ')
    if (!Array.isArray(children)) return
    for (const child of children) visit(child)
    if (!INLINE.has(type)) parts.push(' ')
  }
  for (const node of nodes) visit(node)
  return parts.join('').replace(/\s+/g, ' ').trim()
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** The page's own id for a column without one (client/mdx/dataTable/model.tsx). */
function columnId(node: JsxElement, index: number): string {
  return attributeText(node, 'id').trim() || slug(columnHeader(node)) || `column-${index + 1}`
}

function columnHeader(node: JsxElement): string {
  return attributeText(node, 'header') || visibleText(node.children)
}

/**
 * An id for a column: the header as a slug, or `col-N` without one, never one another column uses.
 * `index` is the column's place, from 0.
 */
export function newColumnId(header: string, taken: readonly string[], index: number): string {
  const base = slug(header)
  if (base) {
    let id = base
    for (let n = 2; taken.includes(id); n += 1) id = `${base}-${n}`
    return id
  }
  let n = index + 1
  while (taken.includes(`col-${n}`)) n += 1
  return `col-${n}`
}

/** What the editor shows: the label, the columns, and each row's cell count. */
export function readDataTable(table: JsxElement): DataTableShape {
  return {
    label: attributeText(table, 'label'),
    columns: columnSlots(table).map((slot, index) => {
      const node = nodeAt(table, slot)
      return {
        id: columnId(node, index),
        header: columnHeader(node),
        search: flagOn(node, 'search'),
        sort: flagOn(node, 'sort'),
        filter: flagOn(node, 'filter'),
      }
    }),
    rows: rowSlots(table).map((slot) => cellSlots(nodeAt(table, slot)).length),
  }
}

function rowAt(table: JsxElement, row: number): JsxElement | undefined {
  const slot = rowSlots(table)[row]
  return slot ? nodeAt(table, slot) : undefined
}

function cellAt(table: JsxElement, row: number, column: number): JsxElement | undefined {
  const node = rowAt(table, row)
  const slot = node ? cellSlots(node)[column] : undefined
  return node && slot ? nodeAt(node, slot) : undefined
}

/** A cell's content as blocks, for the cell's editor. A one-line cell is one paragraph. */
function contentOf(cell: JsxElement): Block[] {
  if (cell.type === 'mdxJsxFlowElement') return cell.children
  return cell.children.length > 0 ? [{ type: 'paragraph', children: cell.children }] : []
}

/** The blocks a cell holds; none for a cell the row does not have. */
export function cellBlocks(table: JsxElement, row: number, column: number): Block[] {
  const cell = cellAt(table, row, column)
  return cell ? contentOf(cell) : []
}

/**
 * Markdown trees compared by meaning: where they sat in the file, and the order an editor wrote
 * their keys in, do not count.
 */
export function sameMdast(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => sameMdast(item, b[index]))
  }
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const keys = (value: object) =>
    Object.entries(value)
      .filter(([key, inner]) => key !== 'position' && inner !== undefined)
      .map(([key]) => key)
      .sort()
  const left = keys(a)
  const right = keys(b)
  if (left.length !== right.length || left.some((key, index) => key !== right[index])) return false
  return left.every((key) => sameMdast((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}

function emptyTextCell(): MdxJsxTextElement {
  return { type: 'mdxJsxTextElement', name: 'Cell', attributes: [], children: [] }
}

function newline(): Text {
  return { type: 'text', value: '\n' }
}

function trimBlank(list: PhrasingContent[]): PhrasingContent[] {
  let start = 0
  let end = list.length
  while (start < end && isBlankText(list[start])) start += 1
  while (end > start && isBlankText(list[end - 1])) end -= 1
  return list.slice(start, end)
}

/**
 * A tag on a line of text becomes a tag on its own lines, so it can hold blocks. Its paragraph
 * splits around it. Returns where the tag now sits.
 */
function liftToFlow(parent: Container, slot: Slot): number {
  if (slot.inline === undefined) return slot.at
  const paragraph = parent.children[slot.at] as Paragraph
  const element = paragraph.children[slot.inline] as unknown as MdxJsxTextElement
  const before = trimBlank(paragraph.children.slice(0, slot.inline))
  const after = trimBlank(paragraph.children.slice(slot.inline + 1))
  const flow: MdxJsxFlowElement = {
    type: 'mdxJsxFlowElement',
    name: element.name,
    attributes: element.attributes,
    children: element.children.length > 0 ? [{ type: 'paragraph', children: element.children }] : [],
  }
  const pieces: unknown[] = []
  if (before.length > 0) pieces.push({ type: 'paragraph', children: before })
  pieces.push(flow)
  if (after.length > 0) pieces.push({ type: 'paragraph', children: after })
  parent.children.splice(slot.at, 1, ...pieces)
  return slot.at + (before.length > 0 ? 1 : 0)
}

/**
 * An empty `<Cell />` on its own line that now holds one line of text goes back on one line,
 * next to the one-line cells around it: `<Cell>a</Cell>` rather than a tag over three lines.
 */
function toTextCell(row: JsxElement, at: number, children: PhrasingContent[]): void {
  const cell = row.children[at] as MdxJsxFlowElement
  const text: MdxJsxTextElement = { type: 'mdxJsxTextElement', name: cell.name, attributes: cell.attributes, children }
  const line: Paragraph = { type: 'paragraph', children: [text] }
  row.children.splice(at, 1, line as never)
  const before = row.children[at - 1]
  if (isTagLine(before)) {
    before.children.push(newline(), ...line.children)
    row.children.splice(at, 1)
    at -= 1
  }
  const merged = row.children[at] as Paragraph
  const after = row.children[at + 1]
  if (isTagLine(after)) {
    merged.children.push(newline(), ...after.children)
    row.children.splice(at + 1, 1)
  }
}

/** Put a new empty cell after (or, with `before`, ahead of) a cell, written the way that cell is. */
function insertCellBeside(row: JsxElement, slot: Slot, before = false): void {
  const anchor = nodeAt(row, slot)
  if (slot.inline !== undefined) {
    const line = (row.children[slot.at] as Paragraph).children
    const at = before ? slot.inline : slot.inline + 1
    line.splice(at, 0, ...((before ? [emptyTextCell(), newline()] : [newline(), emptyTextCell()]) as PhrasingContent[]))
    return
  }
  const fresh =
    anchor.type === 'mdxJsxFlowElement' ? ({ ...emptyTextCell(), type: 'mdxJsxFlowElement' } as MdxJsxFlowElement) : emptyTextCell()
  row.children.splice(before ? slot.at : slot.at + 1, 0, fresh as never)
}

/** Add an empty cell at the end of a row's cells. */
function appendCell(row: JsxElement): void {
  const cells = cellSlots(row)
  const last = cells[cells.length - 1]
  if (last) insertCellBeside(row, last)
  else if (row.type === 'mdxJsxTextElement') row.children.push(emptyTextCell())
  else row.children.push({ type: 'paragraph', children: [emptyTextCell()] })
}

/** Take a tag out, with the line break that set it apart from its neighbour on the same line. */
function removeSlot(parent: Container, slot: Slot): void {
  if (slot.inline === undefined) {
    parent.children.splice(slot.at, 1)
    return
  }
  const line = (parent.children[slot.at] as Paragraph).children
  line.splice(slot.inline, 1)
  if (isBlankText(line[slot.inline - 1])) line.splice(slot.inline - 1, 1)
  else if (isBlankText(line[slot.inline])) line.splice(slot.inline, 1)
  if (line.every(isBlankText)) parent.children.splice(slot.at, 1)
}

/** Empty lines carry nothing in markdown, and an editor leaves them behind. */
function withoutEmptyLines(blocks: readonly Block[]): Block[] {
  return blocks.filter((block) => !(isParagraph(block) && trimBlank(block.children).length === 0))
}

/**
 * The table with one cell's content replaced. Content that means the same returns the same table.
 * A cell keeps its attributes and its form: one line while it holds one paragraph, its own lines
 * when it holds more. A `value` that repeated the cell's text follows the new text; any other value stays.
 */
export function setCellBlocks(table: JsxElement, row: number, column: number, blocks: readonly Block[]): JsxElement {
  const content = withoutEmptyLines(blocks)
  const existing = cellAt(table, row, column)
  if (existing ? sameMdast(contentOf(existing), content) : content.length === 0) return table
  if (!rowAt(table, row)) return table
  const next = structuredClone(table)
  let rowNode = rowAt(next, row)!
  while (cellSlots(rowNode).length <= column) appendCell(rowNode)
  const oneLine = content.length === 0 || (content.length === 1 && isParagraph(content[0]))
  const phrasing = content.length === 1 && isParagraph(content[0]) ? content[0].children : []
  let slot = cellSlots(rowNode)[column]!
  let cell = nodeAt(rowNode, slot)
  followValue(cell, contentOf(cell), content)
  if (oneLine && cell.type === 'mdxJsxTextElement') {
    cell.children = phrasing
  } else if (oneLine && cell.children.length === 0 && phrasing.length > 0 && rowNode.type === 'mdxJsxFlowElement') {
    toTextCell(rowNode, slot.at, phrasing)
  } else if (cell.type === 'mdxJsxFlowElement') {
    cell.children = content
  } else {
    // A one-line cell that now holds several blocks moves onto its own lines, and so does a one-line row around it.
    if (rowNode.type === 'mdxJsxTextElement') {
      const rowSlot = rowSlots(next)[row]!
      liftToFlow(next, rowSlot)
      rowNode = rowAt(next, row)!
      slot = cellSlots(rowNode)[column]!
    }
    const at = liftToFlow(rowNode, slot)
    cell = rowNode.children[at] as MdxJsxFlowElement
    cell.children = content
  }
  return next
}

function followValue(cell: JsxElement, before: readonly Block[], after: readonly Block[]): void {
  const value = attribute(cell, 'value')
  if (!value || typeof value.value !== 'string') return
  const was = visibleText(before)
  const now = visibleText(after)
  if (value.value.trim() !== was || was === now || now === '') return
  value.value = now
}

export function setTableLabel(table: JsxElement, label: string): JsxElement {
  if (attributeText(table, 'label') === label) return table
  const next = structuredClone(table)
  setAttribute(next, 'label', label)
  return next
}

/**
 * Set a column's header. A column added in this editor (`followId`) also takes its id from the
 * header while it is being named; any other column keeps its id.
 */
export function setColumnHeader(table: JsxElement, column: number, header: string, followId = false): JsxElement {
  const slot = columnSlots(table)[column]
  if (!slot) return table
  const next = structuredClone(table)
  const node = nodeAt(next, slot)
  setAttribute(node, 'header', header)
  if (followId) {
    const taken = columnSlots(next)
      .filter((_, index) => index !== column)
      .map((other, index) => columnId(nodeAt(next, other), index))
    setAttribute(node, 'id', newColumnId(header, taken, column))
  }
  return sameMdast(next, table) ? table : next
}

/** Turn `search`, `sort`, or `filter` on or off. One column filters, so `filter` on one turns it off on the rest. */
export function setColumnFlag(table: JsxElement, column: number, flag: ColumnFlag, on: boolean): JsxElement {
  const all = columnSlots(table)
  if (!all[column]) return table
  const next = structuredClone(table)
  all.forEach((slot, index) => {
    const node = nodeAt(next, slot)
    if (index === column) setFlag(node, flag, on)
    else if (flag === 'filter' && on) setFlag(node, 'filter', false)
  })
  return sameMdast(next, table) ? table : next
}

/**
 * Add a column after the last one, with an id from its header (or `col-N`), and an empty cell in
 * every row that has a cell for each column so far. A row with fewer cells already shows the new
 * column empty, so it stays as it is.
 */
export function addColumn(table: JsxElement, header = ''): JsxElement {
  const next = structuredClone(table)
  const all = columnSlots(next)
  const count = all.length
  const taken = all.map((slot, index) => columnId(nodeAt(next, slot), index))
  const attributes: MdxJsxAttribute[] = [{ type: 'mdxJsxAttribute', name: 'id', value: newColumnId(header, taken, count) }]
  if (header) attributes.push({ type: 'mdxJsxAttribute', name: 'header', value: header })
  const node: MdxJsxFlowElement = { type: 'mdxJsxFlowElement', name: 'Column', attributes, children: [] }
  const last = all[count - 1]
  next.children.splice(last ? last.at + 1 : 0, 0, node as never)
  for (const slot of rowSlots(next)) {
    const row = nodeAt(next, slot)
    const cells = cellSlots(row)
    if (cells.length < count) continue
    if (count > 0) insertCellBeside(row, cells[count - 1]!)
    else if (cells[0]) insertCellBeside(row, cells[0], true)
    else appendCell(row)
  }
  return next
}

/** Remove a column and its cell in every row. */
export function removeColumn(table: JsxElement, column: number): JsxElement {
  const slot = columnSlots(table)[column]
  if (!slot) return table
  const next = structuredClone(table)
  // Cells first: removing the column can shift the table's children.
  for (const rowSlot of rowSlots(next)) {
    const row = nodeAt(next, rowSlot)
    const cell = cellSlots(row)[column]
    if (cell) removeSlot(row, cell)
  }
  removeSlot(next, slot)
  return next
}

/** Add a row after the last one, with one empty cell per column, written one cell per line. */
export function addRow(table: JsxElement): JsxElement {
  const next = structuredClone(table)
  const count = columnSlots(next).length
  const cells: PhrasingContent[] = []
  for (let index = 0; index < count; index += 1) {
    if (index > 0) cells.push(newline())
    cells.push(emptyTextCell())
  }
  const row: MdxJsxFlowElement = {
    type: 'mdxJsxFlowElement',
    name: 'Row',
    attributes: [],
    children: cells.length > 0 ? [{ type: 'paragraph', children: cells }] : [],
  }
  const rows = rowSlots(next)
  const columns = columnSlots(next)
  const after = rows[rows.length - 1] ?? columns[columns.length - 1]
  next.children.splice(after ? after.at + 1 : next.children.length, 0, row as never)
  return next
}

export function removeRow(table: JsxElement, row: number): JsxElement {
  const slot = rowSlots(table)[row]
  if (!slot) return table
  const next = structuredClone(table)
  removeSlot(next, slot)
  return next
}

/** A `<DataTable>`, or a row of one, whose parts are written one per line. */
function isTablePartsParent(node: unknown): node is MdxJsxFlowElement {
  if (!isJsx(node) || node.type !== 'mdxJsxFlowElement' || node.children.length === 0) return false
  return node.name === 'DataTable' || (node.name === 'Row' && slots(node, 'Cell').length > 0)
}

/** A column, a row, or a cell on lines of its own, or a line of one-line cells. */
function isTablePart(node: unknown): boolean {
  return (node as { type?: unknown } | null)?.type === 'mdxJsxFlowElement' || isTagLine(node)
}

const HOLE = 'data-table-parts'

/** How deep the element being written sits in other flow tags, as mdast-util-mdx-jsx counts it for its indent. */
function flowDepth(state: State): number {
  let depth = 0
  for (let index = state.stack.length - 1; index >= 0; index -= 1) {
    const name = state.stack[index]
    if (name === 'blockquote' || name === 'listItem') break
    if (name === 'mdxJsxFlowElement') depth += 1
  }
  return depth
}

/**
 * Write a `<DataTable>` and its rows as plan files do: one column, row, or line of cells after
 * another, with no blank line between them. MDX's own writer puts a blank line between every child
 * of a tag, so a one-cell edit would spread the whole table out. Between anything else (inside a
 * cell, or around text that is not a tag) the blank line stays. A tag on its own line starts a new
 * block either way, so the table reads back the same.
 *
 * `flowElement` is mdast-util-mdx-jsx's own writer for flow tags; this one wraps it.
 */
export function compactTableHandler(flowElement: Handle): Handle {
  return function mdxJsxFlowElement(node, parent, state, info) {
    if (!isTablePartsParent(node)) return flowElement(node, parent, state, info)
    // The tag itself as MDX writes it, with a placeholder for its children.
    const shell = flowElement({ ...node, children: [{ type: 'html', value: HOLE }] }, parent, state, info)
    const exit = state.enter('mdxJsxFlowElement' as never)
    const indent = '  '.repeat(flowDepth(state))
    state.indexStack.push(-1)
    let body = ''
    node.children.forEach((child: Block, index: number) => {
      state.indexStack[state.indexStack.length - 1] = index
      const result = state.handle(child, node, state, { before: '\n', after: '\n', now: { line: 1, column: 1 }, lineShift: 0 })
      // A flow tag indents itself; anything else gets the tag's indent, as MDX does it.
      const text =
        child.type === 'mdxJsxFlowElement' ? result : state.indentLines(result, (line, _, blank) => (blank ? '' : indent) + line)
      if (child.type !== 'list') state.bulletLastUsed = undefined
      if (index > 0) body += isTablePart(node.children[index - 1]) && isTablePart(child) ? '\n' : '\n\n'
      body += text
    })
    state.indexStack.pop()
    exit()
    return shell.replace(indent + HOLE, body)
  } as Handle
}

/** The table the `/` menu adds: two columns and one row. */
export function newDataTable(): MdxJsxFlowElement {
  const column = (id: string, header: string): MdxJsxFlowElement => ({
    type: 'mdxJsxFlowElement',
    name: 'Column',
    attributes: [
      { type: 'mdxJsxAttribute', name: 'id', value: id },
      { type: 'mdxJsxAttribute', name: 'header', value: header },
    ],
    children: [],
  })
  const cell = (text: string): MdxJsxTextElement => ({
    type: 'mdxJsxTextElement',
    name: 'Cell',
    attributes: [],
    children: [{ type: 'text', value: text }],
  })
  return {
    type: 'mdxJsxFlowElement',
    name: 'DataTable',
    attributes: [{ type: 'mdxJsxAttribute', name: 'label', value: 'New table' }],
    children: [
      column('name', 'Name'),
      column('notes', 'Notes'),
      {
        type: 'mdxJsxFlowElement',
        name: 'Row',
        attributes: [],
        children: [{ type: 'paragraph', children: [cell('First row'), newline(), cell('What this row holds.')] }],
      },
    ],
  }
}
