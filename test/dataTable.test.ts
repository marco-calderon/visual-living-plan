import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DataTable } from '../client/mdx/dataTable/DataTable.tsx'
import { planHasDataTable } from '../client/mdx/dataTable/detect.ts'
import {
  DATA_TABLE_PAGE_SIZE,
  DATA_TABLE_PAGINATION_AT,
  readDataTable,
  rowMatchesSearch,
  showsPagination,
} from '../client/mdx/dataTable/model.tsx'
import { Cell } from '../client/mdx/dataTable/Cell.tsx'
import { Checkbox } from '../client/ui/checkbox.tsx'
import { Chip } from '../client/entries/Chip.tsx'
import { components } from '../client/entries/index.ts'
import { Column } from '../client/mdx/dataTable/Column.tsx'
import { Pill } from '../client/entries/Pill.tsx'
import { Row } from '../client/mdx/dataTable/Row.tsx'
import { parsePlan } from '../src/parse.ts'

const planMdx = readFileSync(new URL('../client/planMdx.tsx', import.meta.url), 'utf8')
const planComponents = readFileSync(new URL('../client/planComponents.tsx', import.meta.url), 'utf8')

test('a data table is detected from the component and not from a pipe table', () => {
  assert.equal(planHasDataTable('<DataTable label="Ops">\n</DataTable>\n'), true)
  assert.equal(planHasDataTable('| Status | Meaning |\n| --- | --- |\n| PENDING | Waiting |\n'), false)
  assert.equal(planHasDataTable('<table><tr><td>no</td></tr></table>'), false)
  assert.equal(showsPagination(DATA_TABLE_PAGINATION_AT - 1), false)
  assert.equal(showsPagination(DATA_TABLE_PAGINATION_AT), true)
})

test('the table implementation is a dynamic import, not part of the plan component map', () => {
  assert.match(planMdx, /import\('\.\/mdx\/dataTable\/register\.tsx'\)/)
  assert.doesNotMatch(planMdx, /^import\s+.*dataTable\/register/m)
  assert.doesNotMatch(planMdx, /@tanstack\/react-table/)
  assert.doesNotMatch(planComponents, /dataTable|@tanstack\/react-table/)
  assert.match(planComponents, /\.\.\.uiComponents/)
  assert.equal(components.Chip, Chip)
  assert.equal(components.Pill, Pill)
  const register = readFileSync(new URL('../client/mdx/dataTable/register.tsx', import.meta.url), 'utf8')
  const tableCss = readFileSync(new URL('../client/mdx/dataTable/dataTable.css', import.meta.url), 'utf8')
  const primitives = readFileSync(new URL('../client/entries/primitives.css', import.meta.url), 'utf8')
  assert.doesNotMatch(register, /Chip|Pill/)
  assert.doesNotMatch(tableCss, /\.plan-chip|\.plan-pill/)
  assert.match(primitives, /\.plan-chip/)
  assert.match(primitives, /\.plan-pill/)
})

test('cell values keep a sort key and the visible text for search', () => {
  const model = readDataTable(
    tableChildren([
      ['Gateway', createElement(Chip, null, 'gateway')],
      ['succeeded', createElement(Pill, { tone: 'success' }, 'succeeded')],
      ['checked', createElement(Checkbox, { checked: true })],
    ]),
  )
  assert.equal(model.columns.filter((column) => column.filter).length, 1)
  assert.equal(model.columns[1]?.id, 'state')
  assert.equal(model.rows[0]?.cells[1]?.value, 'succeeded')
  assert.match(model.rows[0]?.cells[0]?.search ?? '', /gateway/)
  assert.match(model.rows[0]?.cells[2]?.search ?? '', /checked/)
  assert.equal(model.rows.length, 1)
})

test('pagination stays off below 100 rows and pages a larger table', () => {
  const small = renderToStaticMarkup(createElement(DataTable, { label: 'Owners' }, rows(6)))
  assert.match(small, /data-pagination="false"/)
  assert.doesNotMatch(small, /plan-data-table-pager/)
  assert.equal(countRows(small), 6)
  assert.match(small, /Filter by State/)
  assert.doesNotMatch(small, /aria-label="Search rows"/)
  assert.doesNotMatch(small, /Sort by /)
  assert.doesNotMatch(small, /data-has-wrap/)
  assert.doesNotMatch(small, /data-wrap=/)

  const large = renderToStaticMarkup(
    createElement(DataTable, { label: 'Operations' }, rows(DATA_TABLE_PAGINATION_AT)),
  )
  assert.match(large, /data-pagination="true"/)
  assert.match(large, /plan-data-table-pager/)
  assert.match(large, /Page 1 of /)
  assert.equal(countRows(large), DATA_TABLE_PAGE_SIZE)
  assert.match(large, /data-loaded-rows="100"/)
})

test('search and sort stay off until a column turns each one on', () => {
  const plain = readDataTable([
    createElement(Column, { id: 'name', header: 'Name' }),
    createElement(Column, { id: 'state', header: 'State', filter: true }),
    createElement(Row, null, createElement(Cell, null, 'Gateway'), createElement(Cell, null, 'succeeded')),
  ])
  assert.equal(plain.columns[0]?.search, false)
  assert.equal(plain.columns[0]?.sort, false)
  assert.equal(plain.columns[1]?.filter, true)
  assert.equal(plain.columns[1]?.search, false)

  const opted = readDataTable([
    createElement(Column, { id: 'name', header: 'Name', search: true, sort: true }),
    createElement(Column, { id: 'state', header: 'State', sort: '' }),
    createElement(Column, { id: 'notes', header: 'Notes', search: 'true' }),
    createElement(Column, { id: 'quiet', header: 'Quiet', search: false, sort: 'false' }),
    createElement(
      Row,
      null,
      createElement(Cell, null, 'Gateway'),
      createElement(Cell, null, 'succeeded'),
      createElement(Cell, null, 'lease'),
      createElement(Cell, null, 'hidden'),
    ),
  ])
  assert.deepEqual(
    opted.columns.map((column) => [column.search, column.sort]),
    [
      [true, true],
      [false, true],
      [true, false],
      [false, false],
    ],
  )
  const row = opted.rows[0]
  assert.ok(row)
  assert.equal(rowMatchesSearch(row, [0, 2], 'lease'), true)
  assert.equal(rowMatchesSearch(row, [0, 2], 'hidden'), false)
  assert.equal(rowMatchesSearch(row, [0, 2], 'succeeded'), false)
  assert.equal(rowMatchesSearch(row, [], 'Gateway'), true)

  const html = renderToStaticMarkup(
    createElement(
      DataTable,
      { label: 'Search' },
      createElement(Column, { id: 'name', header: 'Name', search: true, sort: true }),
      createElement(Column, { id: 'state', header: 'State', filter: true }),
      createElement(Row, null, createElement(Cell, null, 'Gateway'), createElement(Cell, null, 'succeeded')),
    ),
  )
  assert.match(html, /aria-label="Search rows"/)
  assert.match(html, /aria-label="Sort by Name"/)
  assert.match(html, /aria-sort="none"/)
  assert.match(html, /plan-data-table-label">State/)
  assert.doesNotMatch(html, /Sort by State/)
  assert.match(html, /Filter by State/)
})

test('a cell wraps on its own, or inside a percentage of the table', () => {
  const model = readDataTable([
    createElement(Column, { id: 'name', header: 'Name' }),
    createElement(Column, { id: 'detail', header: 'Detail' }),
    createElement(Column, { id: 'share', header: 'Share' }),
    createElement(
      Row,
      null,
      createElement(Cell, null, 'Gateway'),
      createElement(Cell, { wrap: true }, 'The gateway retries while the lease is held.'),
      createElement(Cell, { wrap: '40%' }, 'Hourly copy stays in this share of the table.'),
    ),
    createElement(
      Row,
      null,
      createElement(Cell, { wrap: 'nope' }, 'Ignored'),
      createElement(Cell, { wrap: '' }, 'Saved'),
      createElement(Cell, { wrap: 28 }, 'Queue copy'),
    ),
    createElement(
      Row,
      null,
      createElement(Cell, { wrap: false }, 'Off'),
      createElement(Cell, { wrap: '0%' }, 'Zero'),
      createElement(Cell, { wrap: '140%' }, 'Clamped'),
    ),
  ])
  assert.equal(model.columns[0]?.wraps, false)
  assert.equal(model.columns[0]?.share, undefined)
  assert.equal(model.columns[1]?.wraps, true)
  assert.equal(model.columns[1]?.share, undefined)
  assert.equal(model.columns[2]?.share, 100)
  assert.equal(model.rows[0]?.cells[0]?.wrap, undefined)
  assert.equal(model.rows[0]?.cells[1]?.wrap, true)
  assert.equal(model.rows[0]?.cells[2]?.wrap, 40)
  assert.equal(model.rows[1]?.cells[0]?.wrap, undefined)
  assert.equal(model.rows[1]?.cells[1]?.wrap, true)
  assert.equal(model.rows[1]?.cells[2]?.wrap, 28)
  assert.equal(model.rows[2]?.cells[1]?.wrap, undefined)
  assert.equal(model.rows[2]?.cells[2]?.wrap, 100)

  const html = renderToStaticMarkup(
    createElement(
      DataTable,
      { label: 'Wrap' },
      createElement(Column, { id: 'name', header: 'Name' }),
      createElement(Column, { id: 'detail', header: 'Detail' }),
      createElement(Column, { id: 'share', header: 'Share of the table' }),
      createElement(
        Row,
        null,
        createElement(Cell, null, 'Gateway'),
        createElement(Cell, { wrap: true }, 'The gateway retries while the lease is held.'),
        createElement(Cell, { wrap: '40%' }, 'Hourly copy stays in this share of the table.'),
      ),
    ),
  )
  assert.match(html, /data-has-wrap="true"/)
  const headers = tags(html, 'th')
  const cells = tags(html, 'td')
  assert.match(headers[0] ?? '', /data-fit="true"/)
  assert.doesNotMatch(headers[0] ?? '', /data-wrap=/)
  assert.doesNotMatch(headers[1] ?? '', /data-wrap=/)
  assert.match(headers[2] ?? '', /data-wrap="40%"/)
  assert.match(headers[2] ?? '', /--cell-share:\s*40cqw/)
  assert.match(cells[0] ?? '', /data-fit="true"/)
  assert.doesNotMatch(cells[0] ?? '', /data-wrap=/)
  assert.match(cells[1] ?? '', /data-wrap="true"/)
  assert.doesNotMatch(cells[1] ?? '', /--cell-share/)
  assert.match(cells[2] ?? '', /data-wrap="40%"/)
  assert.match(cells[2] ?? '', /--cell-share:\s*40cqw/)
  assert.match(tableCssText(), /overflow-x:\s*auto/)
  assert.match(tableCssText(), /\.plan-data-table :is\(th, td\) \*[\s\S]*white-space:\s*nowrap/)
  assert.match(tableCssText(), /\.plan-data-table-value\[data-wrap\]/)
})

test('a plan with a data table still parses', () => {
  const plan = parsePlan(
    `---
title: Queue
---

<phase id="owners" title="Owners" status="done">
<DataTable label="Owners">
<Column id="name" header="Name" />
<Column id="state" header="State" filter />
<Row>
<Cell>Gateway</Cell>
<Cell value="succeeded"><Pill tone="success">succeeded</Pill></Cell>
</Row>
</DataTable>
</phase>

<workflow id="tables" title="Tables">
\`\`\`workflow
owners | Owners | owners
--
\`\`\`
</workflow>
`,
    'data-table.plan.md',
  )
  assert.equal(plan.title, 'Queue')
  assert.equal(plan.blocks.some((block) => block.type === 'workflow'), true)
  const phase = plan.blocks.find((block) => block.type === 'phase')
  assert.equal(phase && phase.type === 'phase' ? phase.id : '', 'owners')
})

function tableChildren(cells: Array<[string, ReactNode]>): ReactNode {
  return [
    createElement(Column, { id: 'name', header: 'Name' }),
    createElement(Column, { id: 'state', header: 'State', filter: true }),
    createElement(Column, { id: 'checks', header: 'Checks' }),
    createElement(
      Row,
      null,
      createElement(Cell, { value: cells[0]?.[0] }, cells[0]?.[1]),
      createElement(Cell, { value: cells[1]?.[0] }, cells[1]?.[1]),
      createElement(Cell, { value: cells[2]?.[0] }, cells[2]?.[1]),
    ),
  ]
}

function rows(count: number): ReactNode[] {
  const states = ['pending', 'running', 'succeeded', 'failed', 'cancelled']
  const body: ReactNode[] = [
    createElement(Column, { id: 'route', header: 'Route' }),
    createElement(Column, { id: 'state', header: 'State', filter: true }),
    createElement(Column, { id: 'owner', header: 'Owner' }),
  ]
  for (let index = 0; index < count; index += 1) {
    const state = states[index % states.length] ?? 'pending'
    body.push(
      createElement(
        Row,
        { key: index },
        createElement(Cell, null, `GET /ops/${index + 1}`),
        createElement(Cell, { value: state }, createElement(Pill, { tone: 'neutral' }, state)),
        createElement(Cell, null, createElement(Chip, null, 'gateway')),
      ),
    )
  }
  return body
}

function countRows(html: string): number {
  return html.match(/data-row="/g)?.length ?? 0
}

function tags(html: string, tag: 'th' | 'td'): string[] {
  return [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'g'))].map((match) => match[0] ?? '')
}

function tableCssText(): string {
  return readFileSync(new URL('../client/mdx/dataTable/dataTable.css', import.meta.url), 'utf8')
}
