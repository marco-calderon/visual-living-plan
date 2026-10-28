export type ChartRow = {
  label: string
  value: number
}

/** One `label, value` row per line. Used by chart primitives inside shipped MDX. */
export function parseChartRows(source: string): ChartRow[] {
  const rows: ChartRow[] = []
  for (const line of source.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const splitAt = trimmed.lastIndexOf(',')
    if (splitAt <= 0) continue
    const label = trimmed.slice(0, splitAt).trim()
    const value = Number(trimmed.slice(splitAt + 1).trim())
    if (!label || !Number.isFinite(value)) continue
    rows.push({ label, value })
  }
  return rows
}
