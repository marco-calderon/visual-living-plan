type MdNode = {
  type: string
  meta?: string | null
  children?: MdNode[]
  data?: { hProperties?: Record<string, unknown> } & Record<string, unknown>
}

/**
 * Keep a fence's meta (the text after its language, such as `start=40`) on the rendered `<code>`
 * as `data-meta`. MDX drops it otherwise, and the page reads `start=` from it to number the lines.
 */
export function remarkCodeMeta() {
  return (tree: MdNode) => {
    visit(tree)
  }
}

function visit(node: MdNode): void {
  if (node.type === 'code' && node.meta && node.meta.trim()) {
    const data = node.data ?? {}
    node.data = { ...data, hProperties: { ...(data.hProperties ?? {}), 'data-meta': node.meta.trim() } }
  }
  for (const child of node.children ?? []) visit(child)
}

/** The first line number a fence asks for with `start=N`, or undefined. */
export function fenceStartLine(meta: unknown): number | undefined {
  if (typeof meta !== 'string') return undefined
  const match = /(?:^|\s)start=(\d+)(?:\s|$)/i.exec(meta)
  const value = match ? Number(match[1]) : Number.NaN
  return Number.isInteger(value) && value >= 1 ? value : undefined
}
