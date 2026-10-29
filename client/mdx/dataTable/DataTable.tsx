import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import {
  createColumnHelper,
  filterFn_equalsString,
  useTable,
  type Column,
  type ColumnFiltersState,
  type SortingState,
} from '@tanstack/react-table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select.tsx'
import { features, type DataTableFeatures } from './features.ts'
import {
  DATA_TABLE_PAGE_SIZE,
  filterOptions,
  readDataTable,
  showsPagination,
  type RowModel,
} from './model.tsx'

const ALL = '__all__'
const columnHelper = createColumnHelper<DataTableFeatures, RowModel>()

type DataTableProps = {
  children?: ReactNode
  label?: string
  placeholder?: string
}

type SortColumn = Column<DataTableFeatures, RowModel, unknown>

function searchRows(row: { original: RowModel }, _columnId: string, filterValue: unknown): boolean {
  const query = String(filterValue ?? '').trim().toLowerCase()
  if (!query) return true
  return row.original.cells.some((cell) => cell.search.toLowerCase().includes(query))
}

export function DataTable({ children, label, placeholder = 'Search' }: DataTableProps) {
  const model = useMemo(() => readDataTable(children), [children])
  const filterColumn = model.columns.find((column) => column.filter)
  const filterIndex = filterColumn ? model.columns.indexOf(filterColumn) : -1
  const options = useMemo(
    () => (filterIndex >= 0 ? filterOptions(model.rows, filterIndex) : []),
    [filterIndex, model.rows],
  )
  const columns = useMemo(
    () =>
      model.columns.map((column, index) =>
        columnHelper.accessor((row) => row.cells[index]?.value ?? '', {
          id: column.id,
          header: ({ column: headerColumn }) => <SortHeader label={column.header} column={headerColumn} />,
          cell: ({ row }) => <div className="plan-data-table-value">{row.original.cells[index]?.content ?? null}</div>,
          enableSorting: true,
          enableColumnFilter: column.filter,
          filterFn: column.filter ? filterFn_equalsString : undefined,
          sortingFn: 'alphanumeric',
        }),
      ),
    [model.columns],
  )
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: DATA_TABLE_PAGE_SIZE })
  const paginate = showsPagination(model.rows.length)
  const table = useTable({
    features,
    data: model.rows,
    columns,
    getRowId: (row) => row.id,
    globalFilterFn: searchRows,
    state: {
      sorting,
      columnFilters,
      globalFilter: globalFilter.trim() ? globalFilter : undefined,
      pagination: {
        pageIndex: paginate ? pagination.pageIndex : 0,
        pageSize: paginate ? DATA_TABLE_PAGE_SIZE : Math.max(model.rows.length, 1),
      },
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: (updater) => {
      setGlobalFilter((current) => {
        const next = typeof updater === 'function' ? updater(current) : updater
        return typeof next === 'string' ? next : ''
      })
    },
    onPaginationChange: (updater) => {
      setPagination((current) => (typeof updater === 'function' ? updater(current) : updater))
    },
  })
  const filteredCount = table.getFilteredRowModel().rows.length
  const pageCount = Math.max(table.getPageCount(), 1)
  const pageIndex = table.state.pagination.pageIndex
  const selectValue =
    filterColumn && typeof columnFilters.find((filter) => filter.id === filterColumn.id)?.value === 'string'
      ? String(columnFilters.find((filter) => filter.id === filterColumn.id)?.value)
      : ALL
  const selectItems = [{ value: ALL, label: 'All' }, ...options.map((option) => ({ value: option, label: option }))]
  const rowsOnPage = table.getRowModel().rows

  return (
    <div
      className="plan-data-table"
      role="region"
      aria-label={label?.trim() || 'Table'}
      data-plan-data-table=""
      data-loaded-rows={model.rows.length}
      data-pagination={paginate ? 'true' : 'false'}
    >
      <div className="plan-data-table-toolbar" data-plan-grab-ignore="">
        <input
          className="plan-data-table-search"
          type="search"
          placeholder={placeholder}
          aria-label="Search rows"
          autoComplete="off"
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
        />
        {filterColumn ? (
          <div className="plan-data-table-filter">
            <Select
              items={selectItems}
              value={selectValue}
              onValueChange={(value) => {
                const next = value && value !== ALL ? value : ''
                setColumnFilters(next ? [{ id: filterColumn.id, value: next }] : [])
              }}
            >
              <SelectTrigger aria-label={`Filter by ${filterColumn.header}`}>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <p className="plan-data-table-count">
          {filteredCount === model.rows.length
            ? `${model.rows.length} rows`
            : `${filteredCount} of ${model.rows.length} rows`}
        </p>
      </div>
      <div className="plan-data-table-scroll">
        <table>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                    >
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rowsOnPage.length ? (
              rowsOnPage.map((row) => (
                <tr key={row.id} data-row={row.id}>
                  {row.getAllCells().map((cell) => (
                    <td key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={Math.max(columns.length, 1)} className="plan-data-table-empty">
                  No matching rows.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {paginate ? (
        <div className="plan-data-table-pager" data-plan-grab-ignore="">
          <button
            type="button"
            className="plan-btn"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </button>
          <p className="plan-data-table-page">
            Page {pageIndex + 1} of {pageCount}
          </p>
          <button type="button" className="plan-btn" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}

function SortHeader({ label, column }: { label: string; column: SortColumn }) {
  const sorted = column.getIsSorted()
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown
  return (
    <button
      type="button"
      className="plan-data-table-sort"
      data-plan-grab-ignore=""
      data-sort={sorted || undefined}
      aria-label={`Sort by ${label}`}
      onClick={() => column.toggleSorting(sorted === 'asc')}
    >
      <span>{label}</span>
      <Icon size={14} aria-hidden="true" />
    </button>
  )
}
