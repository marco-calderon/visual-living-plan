/**
 * The pipe-table body of a `<workflow>` component. The server outline and the in-page diagram
 * both read it here, so they agree on which lines are steps.
 */

export type WorkflowSourceSide = 'top' | 'right' | 'bottom' | 'left'

export type WorkflowSourceNode = { id: string; label: string; ref?: string; detail?: string }

export type WorkflowSourceEdge = {
  from: string
  to: string
  label?: string
  fromSide?: WorkflowSourceSide
  toSide?: WorkflowSourceSide
}

/** Cells of one body line. Outer pipes are optional, so `| a | A |` reads like `a | A`. */
export function workflowCells(line: string): string[] {
  let text = line.trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|')) text = text.slice(0, -1)
  return text.split('|').map((cell) => cell.trim())
}

/**
 * A column header (`id | label | ref | detail`) or a markdown separator (`--- | ---`).
 * Agents copy these from the docs. They are not steps.
 */
export function isWorkflowTableChrome(cells: readonly string[]): boolean {
  const filled = cells.filter(Boolean)
  if (filled.length === 0) return true
  if (filled.every((cell) => /^:?-{2,}:?$/.test(cell))) return true
  return cells[0]?.toLowerCase() === 'id' && cells[1]?.toLowerCase() === 'label'
}

/** Node cells for a body line, or undefined when the line is not a step. */
export function workflowNodeCells(line: string): string[] | undefined {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('```') || trimmed === '--') return undefined
  const cells = workflowCells(trimmed)
  if (isWorkflowTableChrome(cells)) return undefined
  return cells
}

function sideOf(value: string | undefined): WorkflowSourceSide | undefined {
  if (value === 'top' || value === 'right' || value === 'bottom' || value === 'left') return value
  return undefined
}

/** `from -> to` is the column header from the docs, unless the plan has steps by those names. */
function isEdgeHeader(from: string, to: string, nodes: readonly WorkflowSourceNode[]): boolean {
  if (from.toLowerCase() !== 'from' || to.toLowerCase() !== 'to') return false
  return !nodes.some((node) => node.id === from || node.id === to)
}

export function parseWorkflowSource(source: string): { nodes: WorkflowSourceNode[]; edges: WorkflowSourceEdge[] } {
  const [head, tail = ''] = source.trim().split(/\n\s*--\s*\n/)
  const nodes: WorkflowSourceNode[] = []
  for (const line of (head ?? '').split('\n')) {
    const cells = workflowNodeCells(line)
    if (!cells) continue
    const [id, label, ref, detail] = cells
    if (!id || !label) continue
    nodes.push({
      id,
      label,
      ...(ref ? { ref } : {}),
      ...(detail ? { detail } : {}),
    })
  }
  const edges: WorkflowSourceEdge[] = []
  for (const line of tail.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('```')) continue
    const [path, label] = workflowCells(trimmed)
    const match = /^(\S+)\s*->\s*(\S+)(?:\s+@\s*(\w+)>(\w+))?$/.exec(path ?? '')
    if (!match) continue
    const from = match[1] ?? ''
    const to = match[2] ?? ''
    if (!from || !to) continue
    if (isEdgeHeader(from, to, nodes)) continue
    const fromSide = sideOf(match[3])
    const toSide = sideOf(match[4])
    edges.push({
      from,
      to,
      ...(label ? { label } : {}),
      ...(fromSide ? { fromSide } : {}),
      ...(toSide ? { toSide } : {}),
    })
  }
  return { nodes, edges }
}
