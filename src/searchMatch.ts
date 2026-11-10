/**
 * Term matching for plan search. Exact matching is a substring test, the same as before
 * fuzzy search existed. Fuzzy matching also accepts a word that starts with the term,
 * a word one or two typos away from it, and words run together ("ratelimit").
 * Pure, no I/O, so the local service and the Worker share it.
 */

/** Where a term was found in one text, as offsets into that text. */
export type TermSpot = { start: number; end: number }

export type Matcher = {
  readonly fuzzy: boolean
  /** How well a lowercase term matches somewhere in the text: 0 for no match, 1 for an exact word. */
  score(text: string, term: string): number
  /** The earliest place the term matches in the text, or null. */
  locate(text: string, term: string): TermSpot | null
  /** Every range in the text that matches one of the terms, sorted and merged, for highlighting. */
  ranges(text: string, terms: string[]): Array<[number, number]>
}

/** Score of an exact match that is a whole word. */
const WHOLE_WORD = 1
/** Score of an exact match at the start of a word. */
const WORD_START = 0.9
/** Score of an exact match inside a word. */
const INSIDE_WORD = 0.8
/** Words run together, such as "ratelimit" for "rate limiting". */
const JOINED_WORDS = 0.75
/** One typo away from a whole word. Each further typo costs FURTHER_TYPO. */
const TYPO = 0.7
/** One typo away from the start of a word. */
const TYPO_START = 0.6
const FURTHER_TYPO = 0.15
/** A phrase found word by word across punctuation, as a share of its words' scores. */
const PHRASE_WORDS = 0.95
/** Most distinct words one matcher remembers scores for, per term. */
const CACHE_LIMIT = 20_000

const WORD = /[\p{L}\p{N}_]+/gu

type Word = { text: string; start: number; end: number }

export function createMatcher(fuzzy: boolean): Matcher {
  const cache = new Map<string, Map<string, number>>()

  function wordScore(term: string, word: string): number {
    let known = cache.get(term)
    if (!known) {
      known = new Map()
      cache.set(term, known)
    }
    const hit = known.get(word)
    if (hit !== undefined) return hit
    if (known.size >= CACHE_LIMIT) known.clear()
    const value = scoreWord(term, word)
    known.set(word, value)
    return value
  }

  /** Best fuzzy score for the term over the text's words, and where the first good word is. */
  function fuzzyFind(lower: string, term: string): { score: number; spot: TermSpot | null } {
    const parts = term.match(WORD)
    if (!parts || parts.length === 0) return { score: 0, spot: null }
    const words = wordsOf(lower)
    let best = 0
    let spot: TermSpot | null = null
    for (let index = 0; index < words.length; index += 1) {
      let value = 0
      let end = index
      if (parts.length === 1) {
        value = wordScore(parts[0]!, words[index]!.text)
        if (value < JOINED_WORDS && parts[0]!.length >= 5) {
          const joined = joinedScore(parts[0]!, words, index)
          if (joined.score > value) {
            value = joined.score
            end = joined.end
          }
        }
      } else if (index + parts.length <= words.length) {
        // A phrase matches consecutive words, each one on its own.
        let total = 0
        for (let part = 0; part < parts.length; part += 1) {
          const one = wordScore(parts[part]!, words[index + part]!.text)
          if (one === 0) {
            total = 0
            break
          }
          total += one
        }
        // Just under an exact phrase, so "Fail open" ranks above "fail-open".
        value = (total / parts.length) * PHRASE_WORDS
        end = index + parts.length - 1
      }
      if (value <= 0) continue
      if (!spot) spot = { start: words[index]!.start, end: words[end]!.end }
      if (value > best) best = value
    }
    return { score: best, spot }
  }

  function exactScore(lower: string, term: string): number {
    if (!fuzzy) return lower.includes(term) ? WHOLE_WORD : 0
    let best = 0
    let at = lower.indexOf(term)
    while (at !== -1 && best < WHOLE_WORD) {
      const before = at === 0 || !isWordChar(lower[at - 1]!)
      const after = at + term.length >= lower.length || !isWordChar(lower[at + term.length]!)
      const value = before && after ? WHOLE_WORD : before ? WORD_START : INSIDE_WORD
      if (value > best) best = value
      at = lower.indexOf(term, at + 1)
    }
    return best
  }

  return {
    fuzzy,
    score(text, term) {
      if (!term) return 0
      const lower = text.toLowerCase()
      const exact = exactScore(lower, term)
      // No fuzzy match scores above an exact one.
      if (exact > 0 || !fuzzy) return exact
      return fuzzyFind(lower, term).score
    },
    locate(text, term) {
      if (!term) return null
      const lower = text.toLowerCase()
      const at = lower.indexOf(term)
      if (at !== -1) return { start: at, end: at + term.length }
      if (!fuzzy) return null
      return fuzzyFind(lower, term).spot
    },
    ranges(text, terms) {
      const lower = text.toLowerCase()
      const found: Array<[number, number]> = []
      for (const term of terms) {
        if (!term) continue
        for (let at = lower.indexOf(term); at !== -1; at = lower.indexOf(term, at + term.length)) {
          found.push([at, at + term.length])
        }
        if (!fuzzy) continue
        const parts = term.match(WORD)
        if (!parts || parts.length === 0) continue
        const words = wordsOf(lower)
        for (let index = 0; index + parts.length <= words.length; index += 1) {
          if (parts.length === 1) {
            if (wordScore(parts[0]!, words[index]!.text) > 0) found.push([words[index]!.start, words[index]!.end])
            else if (parts[0]!.length >= 5) {
              const joined = joinedScore(parts[0]!, words, index)
              if (joined.score > 0) found.push([words[index]!.start, words[joined.end]!.end])
            }
            continue
          }
          if (parts.every((part, offset) => wordScore(part, words[index + offset]!.text) > 0)) {
            found.push([words[index]!.start, words[index + parts.length - 1]!.end])
          }
        }
      }
      return merged(found)
    },
  }
}

/**
 * How well a query word matches one text word, both lowercase. 0 is no match.
 * Words up to three letters match exactly or as a word start only. Longer words allow
 * one typo, and words of eight letters or more allow two. A swap of two neighbouring
 * letters is one typo. The first letter has to match, or be swapped with the second.
 */
export function scoreWord(term: string, word: string): number {
  if (!term || !word) return 0
  if (word === term) return WHOLE_WORD
  if (word.startsWith(term)) return WORD_START
  if (term.length >= 3 && word.includes(term)) return INSIDE_WORD
  const allowed = typoBudget(term)
  if (allowed === 0) return 0
  const first = word[0] === term[0] || (word[0] === term[1] && word[1] === term[0])
  if (!first) return 0
  const whole = editDistance(term, word, allowed)
  if (whole <= allowed) return TYPO - FURTHER_TYPO * (whole - 1)
  if (word.length > term.length) {
    let start = allowed + 1
    for (let length = term.length - 1; length <= term.length + 1; length += 1) {
      if (length < 1 || length >= word.length) continue
      start = Math.min(start, editDistance(term, word.slice(0, length), allowed))
    }
    if (start <= allowed) return TYPO_START - FURTHER_TYPO * (start - 1)
  }
  return 0
}

/** Typos a query word may have: none up to three letters, one up to seven, two from eight. */
export function typoBudget(term: string): number {
  if (term.length >= 8) return 2
  if (term.length >= 4) return 1
  return 0
}

/**
 * Optimal string alignment distance (Levenshtein plus swapped neighbours), stopping once
 * it is past `max`. Returns `max + 1` for anything further.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  let before: number[] = []
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    let lowest = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, before[j - 2]! + 1)
      current[j] = value
      if (value < lowest) lowest = value
    }
    if (lowest > max) return max + 1
    before = previous
    previous = current
  }
  return Math.min(previous[b.length]!, max + 1)
}

/** "ratelimit" against "rate limiting": two or three words read as one. */
function joinedScore(term: string, words: Word[], index: number): { score: number; end: number } {
  let text = words[index]!.text
  if (!term.startsWith(text) || text.length >= term.length) return { score: 0, end: index }
  for (let next = index + 1; next < words.length && next <= index + 2; next += 1) {
    text += words[next]!.text
    if (text.startsWith(term)) return { score: JOINED_WORDS, end: next }
    if (!term.startsWith(text)) break
  }
  return { score: 0, end: index }
}

function wordsOf(lower: string): Word[] {
  const words: Word[] = []
  for (const match of lower.matchAll(WORD)) {
    const start = match.index ?? 0
    words.push({ text: match[0], start, end: start + match[0].length })
  }
  return words
}

function isWordChar(char: string): boolean {
  return /[\p{L}\p{N}_]/u.test(char)
}

function merged(ranges: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const out: Array<[number, number]> = []
  for (const range of sorted) {
    const last = out[out.length - 1]
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1])
    else out.push([range[0], range[1]])
  }
  return out
}
