/**
 * Comment targets for one table cell.
 * The static HTML renderer and `stampPlanParts` both use these ids.
 */

/** Document order of `th` and `td` inside markdown tables in one scope. */
export function markdownCellPartId(scope: string, index: number): string {
  return `${scope}/cell:${index}`
}

/**
 * Logical DataTable cell. `rowId` is `header` or the source row id (`row-1`).
 * Sorting, filtering, and paging keep this token on the same cell.
 */
export function dataTableCellToken(rowId: string, columnId: string): string {
  return `${token(rowId)}.${token(columnId)}`
}

/** `tableIndex` is the DataTable's order among data tables in the scope, starting at 1. */
export function dataTableCellPartId(scope: string, tableIndex: number, cellToken: string): string {
  return `${scope}/cell:dt${tableIndex}.${cellToken}`
}

export function isDataTableCellToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,80}\.[A-Za-z0-9_-]{1,80}$/.test(value)
}

function token(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 80)
  return cleaned || 'cell'
}
