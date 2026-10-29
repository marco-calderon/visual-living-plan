/** True when this plan source authors a data table. Pipe tables do not match. */
export function planHasDataTable(source: string): boolean {
  return /<DataTable\b/.test(source)
}
