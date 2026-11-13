import { describe, expect, test } from 'bun:test'
import type { Root } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { mdxFromMarkdown, mdxToMarkdown } from 'mdast-util-mdx'
import { toMarkdown, type Handle } from 'mdast-util-to-markdown'
import { mdxjs } from 'micromark-extension-mdxjs'
import {
  addColumn,
  addRow,
  cellBlocks,
  compactTableHandler,
  newDataTable,
  readDataTable,
  removeColumn,
  removeRow,
  sameMdast,
  setCellBlocks,
  setColumnFlag,
  setColumnHeader,
  setTableLabel,
  visibleText,
  type JsxElement,
} from '../client/editor/dataTableMdast.ts'
import { flattenJsxIndent } from '../src/planMdx/editSource.ts'
import { planNotReadyReason } from '../src/planReady.ts'

const OPERATIONS = `<DataTable label="Operations">
<Column id="route" header="Route" search sort />
<Column id="state" header="State" filter sort />
<Column id="owner" header="Owner" />
<Row>
<Cell>GET /health</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
<Cell><Chip>gateway</Chip></Cell>
</Row>
<Row>
<Cell>POST /api/keys</Cell>
<Cell value="open"><Pill tone="warning">open</Pill></Cell>
<Cell><Chip>platform</Chip></Cell>
</Row>
</DataTable>`

function parse(markdown: string): Root {
  return fromMarkdown(markdown, { extensions: [mdxjs()], mdastExtensions: [mdxFromMarkdown()] })
}

function table(markdown = OPERATIONS): JsxElement {
  return parse(markdown).children[0] as JsxElement
}

const flowElement = (mdxToMarkdown().extensions ?? [])
  .map((extension) => extension.handlers?.mdxJsxFlowElement)
  .find((handler) => handler !== undefined) as Handle

/** The table as the editor writes it, then as the block edit puts it in the file (indent dropped). */
function write(node: unknown): string {
  const text = toMarkdown({ type: 'root', children: [node] } as Root, {
    extensions: [mdxToMarkdown(), { handlers: { mdxJsxFlowElement: compactTableHandler(flowElement) } }],
  })
  return flattenJsxIndent(text).trim()
}

function paragraph(text: string) {
  return { type: 'paragraph' as const, children: [{ type: 'text' as const, value: text }] }
}

async function compiles(markdown: string): Promise<void> {
  expect(await planNotReadyReason(`---\ntitle: Table\n---\n\n${markdown}\n`)).toBeUndefined()
}

describe('reading a data table', () => {
  test('the label, each column with its id, header, and flags, and each row', () => {
    expect(readDataTable(table())).toEqual({
      label: 'Operations',
      columns: [
        { id: 'route', header: 'Route', search: true, sort: true, filter: false },
        { id: 'state', header: 'State', search: false, sort: true, filter: true },
        { id: 'owner', header: 'Owner', search: false, sort: false, filter: false },
      ],
      rows: [3, 3],
    })
  })

  test('a column without an id or header gets the ids the page gives it; "true" and {true} are on, "false" is off', () => {
    const shape = readDataTable(table(`<DataTable>
<Column header="Due date" sort="true" search={true} filter="false" />
<Column />
</DataTable>`))
    expect(shape.columns).toEqual([
      { id: 'due-date', header: 'Due date', search: true, sort: true, filter: false },
      { id: 'column-2', header: '', search: false, sort: false, filter: false },
    ])
  })

  test('a one-line cell reads as one paragraph, a cell on its own lines as its blocks, a missing cell as none', () => {
    const node = table(`<DataTable>
<Column id="a" />
<Column id="b" />
<Row>
<Cell>**bold** and \`code\`</Cell>
<Cell value="checked">
<Checkbox checked />

- lease
- retry
</Cell>
</Row>
<Row>
<Cell>only one</Cell>
</Row>
</DataTable>`)
    expect(cellBlocks(node, 0, 0).map((block) => block.type)).toEqual(['paragraph'])
    expect(visibleText(cellBlocks(node, 0, 0))).toBe('bold and code')
    expect(cellBlocks(node, 0, 1).map((block) => block.type)).toEqual(['mdxJsxFlowElement', 'list'])
    expect(cellBlocks(node, 1, 1)).toEqual([])
    expect(cellBlocks(node, 5, 0)).toEqual([])
  })
})

describe('editing a cell', () => {
  test('the same content, with or without the empty line an editor leaves, is the same table', () => {
    const node = table()
    const blocks = cellBlocks(node, 0, 1)
    expect(setCellBlocks(node, 0, 1, blocks)).toBe(node)
    expect(setCellBlocks(node, 0, 1, [...structuredClone(blocks), { type: 'paragraph', children: [] }])).toBe(node)
    // A cell the row does not have stays missing while it is empty.
    const short = table(`<DataTable>\n<Column id="a" />\n<Column id="b" />\n<Row>\n<Cell>x</Cell>\n</Row>\n</DataTable>`)
    expect(setCellBlocks(short, 0, 1, [{ type: 'paragraph', children: [] }])).toBe(short)
  })

  test('new text keeps the cell on one line, with its attributes and the pill in the cell next to it', () => {
    const next = setCellBlocks(table(), 0, 0, [paragraph('GET /healthz')])
    expect(write(next)).toBe(OPERATIONS.replace('GET /health<', 'GET /healthz<'))
  })

  test('a pill keeps its tone, and a value that repeated the text follows it', () => {
    const node = table()
    const pill = structuredClone(cellBlocks(node, 0, 1))
    const text = (pill[0] as { children: Array<{ children: Array<{ value: string }> }> }).children[0]!.children[0]!
    text.value = 'passed'
    const next = write(setCellBlocks(node, 0, 1, pill))
    expect(next).toContain('<Cell value="passed"><Pill tone="success">passed</Pill></Cell>')
  })

  test('a value that says something else than the text stays', () => {
    const node = table(`<DataTable>\n<Column id="a" />\n<Row>\n<Cell value="2026-01-02">Jan 2</Cell>\n</Row>\n</DataTable>`)
    expect(write(setCellBlocks(node, 0, 0, [paragraph('Jan 3')]))).toContain('<Cell value="2026-01-02">Jan 3</Cell>')
  })

  test('a one-line cell that gets a second paragraph moves onto its own lines; its neighbours stay on theirs', async () => {
    const next = setCellBlocks(table(), 0, 1, [paragraph('first'), paragraph('second')])
    const text = write(next)
    // Its value repeated its text, so it follows the new text.
    expect(text).toContain(`<Cell>GET /health</Cell>
<Cell value="first second">
first

second
</Cell>
<Cell><Chip>gateway</Chip></Cell>`)
    expect(readDataTable(table(text)).rows).toEqual([3, 3])
    expect(visibleText(cellBlocks(table(text), 0, 1))).toBe('first second')
    await compiles(text)
  })

  test('an empty <Cell /> that gets text goes back on one line beside the cells around it', () => {
    const node = table(`<DataTable>
<Column id="a" />
<Column id="b" />
<Column id="c" />
<Row>
<Cell>a</Cell>
<Cell />
<Cell>c</Cell>
</Row>
</DataTable>`)
    expect(write(setCellBlocks(node, 0, 1, [paragraph('b')]))).toBe(`<DataTable>
<Column id="a" />
<Column id="b" />
<Column id="c" />
<Row>
<Cell>a</Cell>
<Cell>b</Cell>
<Cell>c</Cell>
</Row>
</DataTable>`)
  })

  test('a row with fewer cells than columns gets the cells up to the one that was typed in', () => {
    const node = table(`<DataTable>\n<Column id="a" />\n<Column id="b" />\n<Column id="c" />\n<Row>\n<Cell>a</Cell>\n</Row>\n</DataTable>`)
    const next = setCellBlocks(node, 0, 2, [paragraph('c')])
    expect(readDataTable(next).rows).toEqual([3])
    expect(visibleText(cellBlocks(next, 0, 2))).toBe('c')
  })

  test('a row written on one line becomes a row on its own lines when a cell needs blocks', async () => {
    const node = table(`<DataTable>\n<Column id="a" />\n<Column id="b" />\n<Row><Cell>a</Cell><Cell>b</Cell></Row>\n</DataTable>`)
    const next = setCellBlocks(node, 0, 0, [paragraph('one'), paragraph('two')])
    const text = write(next)
    expect(readDataTable(table(text)).rows).toEqual([2])
    expect(visibleText(cellBlocks(table(text), 0, 0))).toBe('one two')
    expect(visibleText(cellBlocks(table(text), 0, 1))).toBe('b')
    await compiles(text)
  })
})

describe('columns', () => {
  test('a header changes and the id stays', () => {
    const next = setColumnHeader(table(), 0, 'Endpoint')
    expect(readDataTable(next).columns[0]).toMatchObject({ id: 'route', header: 'Endpoint' })
    expect(write(next)).toContain('<Column id="route" header="Endpoint" search sort />')
    expect(setColumnHeader(table(), 0, 'Route')).toEqual(table())
  })

  test('a column added here takes a unique slug id from its header, or col-N without one', () => {
    let node = addColumn(table())
    expect(readDataTable(node).columns[3]).toMatchObject({ id: 'col-4', header: '' })
    node = setColumnHeader(node, 3, 'State', true)
    expect(readDataTable(node).columns[3]).toMatchObject({ id: 'state-2', header: 'State' })
    node = setColumnHeader(node, 3, 'Due date', true)
    expect(readDataTable(node).columns[3]).toMatchObject({ id: 'due-date', header: 'Due date' })
    node = setColumnHeader(node, 3, '', true)
    expect(readDataTable(node).columns[3]!.id).toBe('col-4')
    expect(readDataTable(addColumn(table(), 'Owner')).columns[3]).toMatchObject({ id: 'owner-2', header: 'Owner' })
  })

  test('flags turn on bare and off by going away; one column filters', () => {
    let node = setColumnFlag(table(), 2, 'search', true)
    expect(write(node)).toContain('<Column id="owner" header="Owner" search />')
    node = setColumnFlag(node, 0, 'sort', false)
    expect(write(node)).toContain('<Column id="route" header="Route" search />')
    node = setColumnFlag(node, 2, 'filter', true)
    expect(readDataTable(node).columns.map((column) => column.filter)).toEqual([false, false, true])
    expect(write(node)).toContain('<Column id="state" header="State" sort />')
    // A flag already on as "true" stays as written.
    const written = table(`<DataTable>\n<Column id="a" sort="true" />\n</DataTable>`)
    expect(setColumnFlag(written, 0, 'sort', true)).toBe(written)
  })

  test('add a column: an empty cell in each full row, after the last column', async () => {
    const node = table(`<DataTable label="T">
<Column id="a" header="A" />
<Column id="b" header="B" />
<Row>
<Cell>1</Cell>
<Cell>2</Cell>
</Row>
<Row>
<Cell>only</Cell>
</Row>
</DataTable>`)
    const text = write(addColumn(node))
    expect(text).toBe(`<DataTable label="T">
<Column id="a" header="A" />
<Column id="b" header="B" />
<Column id="col-3" />
<Row>
<Cell>1</Cell>
<Cell>2</Cell>
<Cell />
</Row>
<Row>
<Cell>only</Cell>
</Row>
</DataTable>`)
    await compiles(text)
  })

  test('remove a column with its cell in every row, and nothing else', () => {
    const text = write(removeColumn(table(), 1))
    expect(text).toBe(`<DataTable label="Operations">
<Column id="route" header="Route" search sort />
<Column id="owner" header="Owner" />
<Row>
<Cell>GET /health</Cell>
<Cell><Chip>gateway</Chip></Cell>
</Row>
<Row>
<Cell>POST /api/keys</Cell>
<Cell><Chip>platform</Chip></Cell>
</Row>
</DataTable>`)
    // The first and the last cell of a line go cleanly too.
    expect(write(removeColumn(table(), 0))).toContain('<Row>\n<Cell value="succeeded">')
    expect(write(removeColumn(table(), 2))).toContain('<Pill tone="success">succeeded</Pill></Cell>\n</Row>')
  })
})

describe('rows and the table', () => {
  test('add a row with one empty cell per column, and remove one', async () => {
    const added = addRow(table())
    expect(readDataTable(added).rows).toEqual([3, 3, 3])
    const text = write(added)
    expect(text.endsWith('<Row>\n<Cell />\n<Cell />\n<Cell />\n</Row>\n</DataTable>')).toBe(true)
    await compiles(text)
    const typed = setCellBlocks(added, 2, 0, [paragraph('PATCH /api/keys')])
    expect(write(typed)).toContain('<Row>\n<Cell>PATCH /api/keys</Cell>\n<Cell />\n<Cell />\n</Row>')
    expect(readDataTable(removeRow(added, 0)).rows).toEqual([3, 3])
    expect(write(removeRow(table(), 0))).not.toContain('GET /health')
  })

  test('the label changes in place, and the other attributes stay', () => {
    const node = table(`<DataTable label="Ops" wrap locked="false">\n<Column id="a" />\n</DataTable>`)
    expect(write(setTableLabel(node, 'Operations'))).toStartWith('<DataTable label="Operations" wrap locked="false">')
    expect(setTableLabel(node, 'Ops')).toBe(node)
  })

  test('the / menu adds two columns and one row, and it renders', async () => {
    const node = newDataTable()
    expect(readDataTable(node)).toEqual({
      label: 'New table',
      columns: [
        { id: 'name', header: 'Name', search: false, sort: false, filter: false },
        { id: 'notes', header: 'Notes', search: false, sort: false, filter: false },
      ],
      rows: [2],
    })
    await compiles(write(node))
  })
})

describe('writing a data table', () => {
  test('one column, row, or line of cells per line, as the file had it', () => {
    expect(write(table())).toBe(OPERATIONS)
  })

  test('a table inside a card, and blocks inside a cell, keep their blank lines', () => {
    const source = `<callout kind="note" title="Status">
Before the table.

<DataTable label="Ops">
<Column id="a" header="A" />
<Row>
<Cell>
two

paragraphs
</Cell>
</Row>
</DataTable>
</callout>`
    expect(write(parse(source).children[0])).toBe(source)
  })

  test('a layout row is not a table row: its children keep MDX’s blank lines', () => {
    const source = `<Row gap={16}>\n<Box>\na\n</Box>\n<Box>\nb\n</Box>\n</Row>`
    expect(write(parse(source).children[0])).toContain('</Box>\n\n<Box>')
  })

  test('trees compare by meaning, not by position or key order', () => {
    expect(sameMdast({ type: 'text', value: 'a', position: { start: 1 } }, { value: 'a', type: 'text' })).toBe(true)
    expect(sameMdast({ type: 'text', value: 'a' }, { type: 'text', value: 'b' })).toBe(false)
  })
})
