export type PublishedVersionOption = {
  seq: number
  createdAt?: number
}

export type VersionMenuEntry = {
  kind: 'live' | 'version'
  seq: number | null
  label: string
  href: string
}

/** Live plan first, then published versions from newest to oldest. */
export function versionMenuEntries(
  planId: string,
  versions: readonly PublishedVersionOption[],
  liveHref = `/plans/${planId}`,
): VersionMenuEntry[] {
  const seen = new Set<number>()
  const published = versions
    .filter((version) => Number.isInteger(version.seq) && version.seq > 0)
    .slice()
    .sort((left, right) => right.seq - left.seq || (right.createdAt ?? 0) - (left.createdAt ?? 0))
    .filter((version) => {
      if (seen.has(version.seq)) return false
      seen.add(version.seq)
      return true
    })
  return [
    { kind: 'live', seq: null, label: 'Live', href: liveHref },
    ...published.map((version) => ({
      kind: 'version' as const,
      seq: version.seq,
      label: `Version ${version.seq}`,
      href: `/plans/${planId}/versions/${version.seq}`,
    })),
  ]
}
