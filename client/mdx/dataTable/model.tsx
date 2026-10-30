import { Children, isValidElement, type CSSProperties, type ReactNode } from 'react'
import { entryKindOf } from '../../entries/planEntry.ts'
import { Checkbox } from '../../ui/checkbox.tsx'
import { collectText } from '../textChildren.ts'

export const DATA_TABLE_PAGE_SIZE = 10
export const DATA_TABLE_PAGINATION_AT = 100

const PART = Symbol.for('visual-living-plan.table-part')

/** `true` wraps in the column. A number is the percentage of the table the cell wraps inside. */
export type CellWrap = true | number

export type CellModel = {
  value: string
  search: string
  content: ReactNode
  wrap?: CellWrap
}

export type RowModel = {
  id: string
  cells: CellModel[]
}

export type ColumnModel = {
  id: string
  header: string
  filter: boolean
  /** Some cell in this column wraps, so the column can shrink while other columns stay on one line. */
  wraps: boolean
  /** Widest percentage set on a cell in this column. The header wraps inside it. */
  share?: number
}

type ColumnProps = {
  id?: string
  header?: string
  filter?: boolean | string
  children?: ReactNode
}

type CellProps = {
  value?: string | number
  wrap?: boolean | string | number
  children?: ReactNode
}

type FieldProps = {
  type?: string
  label?: string
  default?: string | number
  options?: string[] | string
  children?: ReactNode
}

export function showsPagination(rowCount: number): boolean {
  return rowCount >= DATA_TABLE_PAGINATION_AT
}

export function markPart<T>(component: T, part: string): T {
  ;(component as { [PART]?: string })[PART] = part
  return component
}

export function partKind(type: unknown): string | undefined {
  if (type == null || (typeof type !== 'function' && typeof type !== 'object')) return undefined
  const kind = (type as { [PART]?: string })[PART]
  return typeof kind === 'string' ? kind : undefined
}

export function readDataTable(children: ReactNode): { columns: ColumnModel[]; rows: RowModel[] } {
  const columns: ColumnModel[] = []
  const rows: RowModel[] = []
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const part = partKind(child.type)
    if (part === 'column') {
      const props = child.props as ColumnProps
      const header =
        textOf(props.header) || collectText(props.children).replace(/\s+/g, ' ').trim() || `Column ${columns.length + 1}`
      columns.push({
        id: uniqueId(textOf(props.id) || slug(header), columns),
        header,
        filter: enabled(props.filter),
        wraps: false,
      })
      return
    }
    if (part === 'row') {
      const cells: CellModel[] = []
      Children.forEach((child.props as { children?: ReactNode }).children, (cell) => {
        if (!isValidElement(cell) || partKind(cell.type) !== 'cell') return
        cells.push(readCell(cell.props as CellProps))
      })
      rows.push({ id: `row-${rows.length + 1}`, cells })
    }
  })
  const width = columns.length
  for (const row of rows) {
    while (row.cells.length < width) row.cells.push(emptyCell())
    if (row.cells.length > width) row.cells.length = width
  }
  let seenFilter = false
  for (const column of columns) {
    if (!column.filter) continue
    if (seenFilter) column.filter = false
    else seenFilter = true
  }
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index]
    if (!column) continue
    let share: number | undefined
    for (const row of rows) {
      const wrap = row.cells[index]?.wrap
      if (wrap == null) continue
      column.wraps = true
      if (typeof wrap !== 'number') continue
      share = share == null ? wrap : Math.max(share, wrap)
    }
    if (share != null) column.share = share
  }
  return { columns, rows }
}

export function readWrap(value: boolean | string | number | undefined): CellWrap | undefined {
  if (value == null || value === false || value === 'false') return undefined
  if (value === true || value === '' || value === 'true') return true
  const raw = typeof value === 'number' ? String(value) : value.trim()
  const match = /^(\d+(?:\.\d+)?)%?$/.exec(raw)
  if (!match) return undefined
  const percent = Number(match[1])
  if (!Number.isFinite(percent) || percent <= 0) return undefined
  return Math.min(percent, 100)
}

export function cellWrapAttrs(wrap: CellWrap | undefined): {
  'data-wrap'?: string
  style?: CSSProperties
} {
  if (typeof wrap !== 'number') return wrap === true ? { 'data-wrap': 'true' } : {}
  return {
    'data-wrap': `${wrap}%`,
    style: { '--cell-share': `${wrap}cqw` } as CSSProperties,
  }
}

export function filterOptions(rows: readonly RowModel[], index: number): string[] {
  const seen = new Set<string>()
  const options: string[] = []
  for (const row of rows) {
    const value = row.cells[index]?.value ?? ''
    if (!value || seen.has(value)) continue
    seen.add(value)
    options.push(value)
  }
  return options
}

function readCell(props: CellProps): CellModel {
  const visible = collectText(props.children).replace(/\s+/g, ' ').trim()
  const extra = controlSearch(props.children)
  const explicit = props.value == null ? '' : String(props.value).trim()
  const value = explicit || visible || extra || ''
  const search = joinSearch([explicit, visible, extra])
  return { value, search, content: props.children ?? null, wrap: readWrap(props.wrap) }
}

function controlSearch(children: ReactNode): string {
  const parts: string[] = []
  const visit = (node: ReactNode) => {
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) return
      if (child.type === Checkbox) {
        const props = child.props as { checked?: boolean | string; defaultChecked?: boolean | string }
        const checked = flag(props.checked) ?? flag(props.defaultChecked) ?? false
        parts.push(checked ? 'checked' : 'unchecked')
      }
      if (entryKindOf(child.type) === 'field') parts.push(fieldSearch(child.props as FieldProps))
      visit((child.props as { children?: ReactNode }).children)
    })
  }
  visit(children)
  return joinSearch(parts)
}

function fieldSearch(props: FieldProps): string {
  if (props.type !== 'checkbox') return ''
  const label = textOf(props.label)
  const fallback = props.default == null ? '' : String(props.default).trim()
  const options = Array.isArray(props.options)
    ? props.options
    : typeof props.options === 'string'
      ? props.options
          .split(',')
          .map((option) => option.trim())
          .filter(Boolean)
      : []
  if (options.length === 0) return joinSearch([label, fallback === 'true' ? 'checked' : 'unchecked'])
  return joinSearch([label, fallback])
}

function emptyCell(): CellModel {
  return { value: '', search: '', content: null }
}

function joinSearch(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
}

function textOf(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function enabled(value: boolean | string | undefined): boolean {
  return value === true || value === '' || value === 'true'
}

function flag(value: boolean | string | undefined): boolean | undefined {
  if (value === true || value === '' || value === 'true') return true
  if (value === false || value === 'false') return false
  return undefined
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function uniqueId(base: string, columns: readonly ColumnModel[]): string {
  const id = base || `column-${columns.length + 1}`
  if (!columns.some((column) => column.id === id)) return id
  return `${id}-${columns.length + 1}`
}
