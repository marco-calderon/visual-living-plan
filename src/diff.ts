import type { SectionDiff } from './types.js'

function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  const aTokens = new Set(a.toLowerCase().split(/\s+/).filter(Boolean))
  const bTokens = new Set(b.toLowerCase().split(/\s+/).filter(Boolean))
  let overlap = 0
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1
  }
  return overlap / Math.max(aTokens.size, bTokens.size)
}

export function diffSections(previous: string[], current: string[]): SectionDiff[] {
  const used = new Set<number>()
  const diffs: SectionDiff[] = []

  current.forEach((section, index) => {
    const exact = previous.findIndex((candidate, candidateIndex) => {
      return !used.has(candidateIndex) && candidate === section
    })
    if (exact !== -1) {
      used.add(exact)
      diffs.push({ index, status: 'unchanged' })
      return
    }

    let bestIndex = -1
    let bestScore = 0
    previous.forEach((candidate, candidateIndex) => {
      if (used.has(candidateIndex)) return
      const score = similarity(candidate, section)
      if (score > bestScore) {
        bestScore = score
        bestIndex = candidateIndex
      }
    })

    if (bestIndex !== -1 && bestScore >= 0.45) {
      used.add(bestIndex)
      diffs.push({ index, status: 'edited' })
      return
    }

    diffs.push({ index, status: 'added' })
  })

  return diffs
}
