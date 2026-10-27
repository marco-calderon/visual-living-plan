import { parse as parseYaml } from 'yaml'
import { asRecord } from './payload'
import { rewriteFencesToTags } from './shim'

export function preparePlanSource(source: string): {
  meta: Record<string, unknown>
  body: string
  rewritten: string
} {
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const { meta, body } = stripFrontmatter(normalized)
  return { meta, body, rewritten: rewriteFencesToTags(body) }
}

function stripFrontmatter(source: string): { meta: Record<string, unknown>; body: string } {
  if (!source.startsWith('---\n')) return { meta: {}, body: source }
  const end = source.indexOf('\n---\n', 4)
  if (end === -1) return { meta: {}, body: source }
  const raw = source.slice(4, end)
  const body = source.slice(end + 5)
  return { meta: asRecord(parseYaml(raw)), body }
}
