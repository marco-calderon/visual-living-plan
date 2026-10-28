import { parse as parseYaml } from 'yaml'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/** Frontmatter is document metadata. Entry fences are not rewritten into components. */
export function preparePlanSource(source: string): { meta: Record<string, unknown>; body: string } {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return { meta: {}, body: normalized }
  const end = normalized.indexOf('\n---\n', 4)
  if (end === -1) return { meta: {}, body: normalized }
  const raw = normalized.slice(4, end)
  return { meta: asRecord(parseYaml(raw)), body: normalized.slice(end + 5) }
}
