const CLOUD_ID = /^[A-Za-z0-9_-]{8,80}$/

/** The hosted id written into plan frontmatter, when the file already has one. */
export function cloudIdInSource(source: string): string | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source.replace(/^\uFEFF/, ''))
  if (!match) return null
  const line = match[1].split('\n').find((entry) => /^cloudId\s*:/.test(entry))
  if (!line) return null
  const raw = line.slice(line.indexOf(':') + 1).trim().replace(/^['"]|['"]$/g, '')
  return CLOUD_ID.test(raw) ? raw : null
}

/** Insert or replace `cloudId` without rewriting the rest of the file. */
export function sourceWithCloudId(source: string, cloudId: string): string {
  if (!CLOUD_ID.test(cloudId)) throw new Error('Invalid cloud id')
  if (cloudIdInSource(source) === cloudId) return source
  const normalized = source.replace(/^\uFEFF/, '')
  const line = `cloudId: ${cloudId}`
  if (/^---\r?\n/.test(normalized)) {
    const end = normalized.indexOf('\n---', 4)
    if (end !== -1) {
      const head = normalized.slice(4, end)
      const next = /^cloudId\s*:.*$/m.test(head) ? head.replace(/^cloudId\s*:.*$/m, line) : `${line}\n${head}`
      return `${normalized.slice(0, 4)}${next}${normalized.slice(end)}`
    }
  }
  return `---\n${line}\n---\n${normalized}`
}
