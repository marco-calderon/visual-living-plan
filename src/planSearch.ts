import { blockAnchorId } from './parse'
import { preparePlanSource } from './planMdx/frontmatter'
import { buildMdxOutline, legacyPlanSyntaxError } from './planMdx/outline'
import { createMatcher, type Matcher } from './searchMatch'
import type { PlanBlock } from './types'
import { isWorkflowTableChrome, workflowCells } from './workflowSource'

/** Most terms one query may hold. */
export const SEARCH_TERM_LIMIT = 10
/** Longest query text accepted. */
export const SEARCH_QUERY_LIMIT = 200
/** Most hits one response carries, across every version searched. */
export const SEARCH_HIT_LIMIT = 200

/** Most plans one dashboard search reads, newest first. */
export const DASHBOARD_PLAN_LIMIT = 100
/** Most saved versions per plan a dashboard search reads with `version=all`. */
export const DASHBOARD_VERSIONS_PER_PLAN = 10

const SNIPPET_LENGTH = 160

export type SearchMatch = 'all' | 'any'

/** `live` is the plan as it is now. A number is one saved version. `all` is the live plan and every saved version. */
export type SearchVersion = 'live' | 'all' | number

export type SearchHit = {
  blockId?: string
  type: PlanBlock['type'] | 'line'
  title?: string
  line: number
  snippet: string
  matched: string[]
  /** Fuzzy search only: how close the block came, 0 to 1, averaged over the matched terms. */
  score?: number
  /** Fuzzy search only: `[start, end)` offsets in `snippet` to highlight. */
  ranges?: Array<[number, number]>
}

export type SearchVersionResult = {
  seq: number | 'live'
  title: string
  createdAt: number | null
  live: boolean
  parsed: boolean
  hits: SearchHit[]
}

export type SearchResponse = {
  planId: string
  query: string
  terms: string[]
  match: SearchMatch
  /** True when terms also matched word starts, typos, and words run together. */
  fuzzy: boolean
  version: SearchVersion
  truncated: boolean
  versions: SearchVersionResult[]
}

export type SearchDocument = {
  seq: number | 'live'
  title: string
  source: string
  createdAt: number | null
}

export class SearchRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'SearchRequestError'
  }
}

/** Split a query into lowercase terms. A `"double quoted phrase"` stays one term. */
export function parseSearchQuery(input: string): string[] {
  const query = input.trim()
  if (!query) throw new SearchRequestError(400, 'A search needs a query.')
  if (query.length > SEARCH_QUERY_LIMIT) {
    throw new SearchRequestError(400, `A search query can be at most ${SEARCH_QUERY_LIMIT} characters.`)
  }
  const terms: string[] = []
  for (const match of query.matchAll(/"([^"]*)"|(\S+)/g)) {
    const term = (match[1] ?? match[2] ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
    if (term && !terms.includes(term)) terms.push(term)
  }
  if (terms.length === 0) throw new SearchRequestError(400, 'A search needs a query.')
  if (terms.length > SEARCH_TERM_LIMIT) {
    throw new SearchRequestError(400, `A search can hold at most ${SEARCH_TERM_LIMIT} terms.`)
  }
  return terms
}

/** Read the `version` parameter. Missing means live. */
export function parseSearchVersion(value: string | null | undefined): SearchVersion {
  if (value == null || value === '' || value === 'live') return 'live'
  if (value === 'all') return 'all'
  if (/^[1-9]\d{0,8}$/.test(value)) return Number(value)
  throw new SearchRequestError(400, 'version must be live, all, or a version number.')
}

export function parseSearchMatch(value: string | null | undefined): SearchMatch {
  if (value == null || value === '' || value === 'all') return 'all'
  if (value === 'any') return 'any'
  throw new SearchRequestError(400, 'match must be all or any.')
}

/** Read the `fuzzy` parameter. Missing means exact matching. */
export function parseSearchFuzzy(value: string | null | undefined): boolean {
  if (value == null || value === '' || value === 'off' || value === 'false' || value === '0') return false
  if (value === 'on' || value === 'true' || value === '1') return true
  throw new SearchRequestError(400, 'fuzzy must be on or off.')
}

/** Read `q`, `version`, `match`, and `fuzzy` from a search URL. */
export function searchParams(url: URL): {
  query: string
  terms: string[]
  version: SearchVersion
  match: SearchMatch
  fuzzy: boolean
} {
  const query = url.searchParams.get('q') ?? ''
  return {
    query,
    terms: parseSearchQuery(query),
    version: parseSearchVersion(url.searchParams.get('version')),
    match: parseSearchMatch(url.searchParams.get('match')),
    fuzzy: parseSearchFuzzy(url.searchParams.get('fuzzy')),
  }
}

export type SearchOptions = {
  /** Also match word starts, typos, and words run together. Off by default. */
  fuzzy?: boolean
  /**
   * Terms found elsewhere in the plan, such as its title. With `match: 'all'` a block that
   * holds the other terms is a hit. A block still needs one term of its own.
   */
  covered?: string[]
  /** Reuse one matcher across documents so word scores are worked out once. */
  matcher?: Matcher
}

type Unit = {
  blockId?: string
  type: SearchHit['type']
  title?: string
  /** 1-based line in the full file where the unit starts. */
  startLine: number
  lines: string[]
}

/** Search one plan document block by block. A document that no longer parses is searched line by line. */
export function searchPlanSource(
  source: string,
  terms: string[],
  match: SearchMatch = 'all',
  options: SearchOptions = {},
): { parsed: boolean; hits: SearchHit[] } {
  const matcher = options.matcher ?? createMatcher(Boolean(options.fuzzy))
  const covered = options.covered ?? []
  const normalized = source.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const units = planUnits(normalized)
  if (!units) return { parsed: false, hits: searchLines(normalized, terms, match, matcher, covered) }
  const hits: SearchHit[] = []
  for (const unit of units) {
    const hit = searchUnit(unit, terms, match, matcher, covered)
    if (hit) hits.push(hit)
  }
  return { parsed: true, hits: ranked(hits) }
}

/**
 * Search the documents a request selected. A saved version whose source is the live source
 * is folded into the live result, so the same text is not listed twice.
 */
export function searchPlanDocuments(input: {
  planId: string
  query: string
  terms: string[]
  match: SearchMatch
  fuzzy?: boolean
  version: SearchVersion
  live: SearchDocument | null
  saved: SearchDocument[]
}): SearchResponse {
  const fuzzy = Boolean(input.fuzzy)
  const matcher = createMatcher(fuzzy)
  const documents: SearchDocument[] = []
  if (input.live && (input.version === 'live' || input.version === 'all')) documents.push(input.live)
  if (input.version === 'all') {
    const newest = [...input.saved].sort((a, b) => Number(b.seq) - Number(a.seq))
    for (const saved of newest) {
      if (input.live && saved.source === input.live.source) continue
      documents.push(saved)
    }
  } else if (typeof input.version === 'number') {
    documents.push(...input.saved.filter((saved) => saved.seq === input.version))
  }
  let remaining = SEARCH_HIT_LIMIT
  let truncated = false
  const versions: SearchVersionResult[] = []
  for (const document of documents) {
    const result = searchPlanSource(document.source, input.terms, input.match, { matcher })
    let hits = result.hits
    if (hits.length > remaining) {
      hits = hits.slice(0, remaining)
      truncated = true
    }
    remaining -= hits.length
    versions.push({
      seq: document.seq,
      title: document.title,
      createdAt: document.createdAt,
      live: document.seq === 'live',
      parsed: result.parsed,
      hits,
    })
  }
  return {
    planId: input.planId,
    query: input.query,
    terms: input.terms,
    match: input.match,
    fuzzy,
    version: input.version,
    truncated,
    versions,
  }
}

/** One listed plan for a dashboard search, with its documents newest first. The first is the live one. */
export type DashboardSearchSource = {
  planId: string
  title: string
  /** What the dashboard links for this plan, or null when it has no page to open. */
  url: string | null
  /** Page for a saved version, when the host has one. */
  versionUrl?: (seq: number) => string | null
  documents: Array<{ seq: number; title: string; source: string; createdAt: number | null }>
}

export type DashboardSearchVersion = SearchVersionResult & { url: string | null }

export type DashboardSearchPlan = {
  planId: string
  title: string
  url: string | null
  /** Where the plan title opens: its page while it runs, else its newest saved version where the host has one. */
  openUrl?: string | null
  /** Terms found in the plan title. A title that holds every term (or one, with `match: 'any'`) lists the plan on its own. */
  titleMatched?: string[]
  /** Fuzzy search only: `[start, end)` offsets in `title` to highlight. */
  titleRanges?: Array<[number, number]>
  versions: DashboardSearchVersion[]
}

export type DashboardSearchResponse = {
  query: string
  terms: string[]
  match: SearchMatch
  fuzzy: boolean
  version: 'live' | 'all'
  truncated: boolean
  searchedPlans: number
  plans: DashboardSearchPlan[]
}

/** Read `q`, `version`, `match`, and `fuzzy` for a dashboard search. A version number only applies to one plan. */
export function dashboardSearchParams(url: URL): {
  query: string
  terms: string[]
  version: 'live' | 'all'
  match: SearchMatch
  fuzzy: boolean
} {
  const params = searchParams(url)
  if (typeof params.version === 'number') {
    throw new SearchRequestError(400, 'A dashboard search takes version=live or version=all. Search one plan for a version number.')
  }
  return { ...params, version: params.version }
}

/**
 * Search every plan a dashboard lists, by title and by content. Only each plan's live document
 * is read unless `version` is `all`. Plans with the most matched terms come first, then plans
 * whose title matched, then the closest matches, then the dashboard's order.
 */
export function searchPlans(input: {
  query: string
  terms: string[]
  match: SearchMatch
  fuzzy?: boolean
  version: 'live' | 'all'
  plans: DashboardSearchSource[]
}): DashboardSearchResponse {
  const fuzzy = Boolean(input.fuzzy)
  // One matcher for the whole request, so a word shared by many plans is scored once.
  const matcher = createMatcher(fuzzy)
  const listed = input.plans.slice(0, DASHBOARD_PLAN_LIMIT)
  let remaining = SEARCH_HIT_LIMIT
  let truncated = input.plans.length > listed.length
  const found: Array<{ plan: DashboardSearchPlan; best: number; titled: number; score: number; hits: number; order: number }> = []
  listed.forEach((plan, order) => {
    const newest = [...plan.documents].sort((a, b) => b.seq - a.seq)
    const live = newest[0]
    if (!live) return
    const title = live.title || plan.title
    const titleScores = input.terms.map((term) => matcher.score(title, term))
    const titleMatched = input.terms.filter((_, index) => (titleScores[index] ?? 0) > 0)
    const titleListed =
      titleMatched.length > 0 && (input.match === 'any' || titleMatched.length === input.terms.length)
    const documents = input.version === 'all' ? newest.slice(0, DASHBOARD_VERSIONS_PER_PLAN) : [live]
    const versions: DashboardSearchVersion[] = []
    for (const document of documents) {
      if (remaining <= 0) {
        truncated = true
        break
      }
      const isLive = document === live
      // An older version with the live text adds nothing.
      if (!isLive && document.source === live.source) continue
      const result = searchPlanSource(document.source, input.terms, input.match, { matcher, covered: titleMatched })
      if (result.hits.length === 0) continue
      let hits = result.hits
      if (hits.length > remaining) {
        hits = hits.slice(0, remaining)
        truncated = true
      }
      remaining -= hits.length
      versions.push({
        seq: document.seq,
        title: document.title,
        createdAt: document.createdAt,
        live: isLive,
        parsed: result.parsed,
        hits,
        // A finished plan has no live page, so its live hit opens the saved version where the host has one.
        url: isLive ? (plan.url ?? plan.versionUrl?.(document.seq) ?? null) : (plan.versionUrl?.(document.seq) ?? null),
      })
    }
    if (versions.length === 0 && !titleListed) return
    const all = versions.flatMap((version) => version.hits)
    // A hit counts the terms the title holds too, since the title names the whole plan.
    const coverage = (matched: string[]) => new Set([...matched, ...titleMatched]).size
    const titleScore = titleMatched.length > 0 ? average(titleScores.filter((value) => value > 0)) : 0
    found.push({
      plan: {
        planId: plan.planId,
        title,
        url: plan.url,
        openUrl: plan.url ?? plan.versionUrl?.(live.seq) ?? null,
        titleMatched,
        ...(fuzzy && titleMatched.length > 0 ? { titleRanges: matcher.ranges(title, titleMatched) } : {}),
        versions,
      },
      best: Math.max(titleListed ? titleMatched.length : 0, ...all.map((hit) => coverage(hit.matched))),
      titled: titleMatched.length,
      score: Math.max(titleScore, ...all.map((hit) => hit.score ?? 1)),
      hits: all.length,
      order,
    })
  })
  found.sort(
    (a, b) => b.best - a.best || b.titled - a.titled || b.score - a.score || b.hits - a.hits || a.order - b.order,
  )
  return {
    query: input.query,
    terms: input.terms,
    match: input.match,
    fuzzy,
    version: input.version,
    truncated,
    searchedPlans: listed.length,
    plans: found.map((entry) => entry.plan),
  }
}

/** Text listing for the CLI: one heading per version, one line per hit. */
export function formatSearchResponse(result: SearchResponse): string {
  const total = result.versions.reduce((sum, entry) => sum + entry.hits.length, 0)
  const searched = result.versions.map((entry) => (entry.seq === 'live' ? 'live' : `v${entry.seq}`)).join(', ') || 'nothing'
  if (total === 0) return `No matches for ${result.terms.map((term) => JSON.stringify(term)).join(' ')} in ${searched}.`
  const lines: string[] = []
  for (const entry of result.versions) {
    if (entry.hits.length === 0) continue
    const label = entry.seq === 'live' ? 'live' : `v${entry.seq}`
    lines.push(`${label}  ${entry.title}${entry.parsed ? '' : '  (searched line by line: this version does not parse)'}`)
    for (const hit of entry.hits) {
      const where = [hit.type, hit.blockId ?? hit.title].filter(Boolean).join('  ')
      lines.push(`  ${where}  L${hit.line}  ${hit.snippet}`)
    }
  }
  lines.push(`${total} ${total === 1 ? 'match' : 'matches'} in ${searched}.${result.truncated ? ' More were left out.' : ''}`)
  return lines.join('\n')
}

function planUnits(source: string): Unit[] | null {
  let body: string
  let blocks: PlanBlock[]
  try {
    body = preparePlanSource(source).body
    if (legacyPlanSyntaxError(body)) return null
    blocks = buildMdxOutline(body).blocks
  } catch {
    return null
  }
  const bodyStart = source.length - body.length
  const units: Unit[] = []
  let cursor = bodyStart
  blocks.forEach((block, index) => {
    const raw = block.source
    let at = raw ? source.indexOf(raw, cursor) : -1
    if (at === -1) {
      const first = raw.split('\n').find((line) => line.trim())?.trim()
      at = first ? source.indexOf(first, cursor) : -1
    }
    if (at === -1) at = cursor
    else cursor = at + raw.length
    const startLine = lineAt(source, at)
    const lines = raw.split('\n')
    if (block.type === 'markdown') units.push(...markdownUnits(lines, startLine))
    else units.push({ blockId: blockAnchorId(block, index), type: block.type, title: blockTitle(block), startLine, lines })
  })
  return units
}

/** A markdown block is split at its headings, so each section is its own hit. */
function markdownUnits(lines: string[], startLine: number): Unit[] {
  const units: Unit[] = []
  let current: Unit = { type: 'markdown', startLine, lines: [] }
  lines.forEach((line, offset) => {
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading && current.lines.length > 0) {
      units.push(current)
      current = { type: 'markdown', startLine: startLine + offset, lines: [] }
    }
    if (heading) current.title = heading[1]
    current.lines.push(line)
  })
  if (current.lines.length > 0) units.push(current)
  return units
}

function blockTitle(block: PlanBlock): string | undefined {
  switch (block.type) {
    case 'phase':
      return block.title
    case 'callout':
    case 'checklist':
    case 'workflow':
      return block.title
    case 'choice':
    case 'approve':
    case 'form':
    case 'questions':
      return block.prompt
    case 'markdown':
      return undefined
  }
}

/** A workflow row shows its label and detail. Ids, refs, and `a -> b` edges are not on the page as text. */
function workflowText(line: string): string {
  const trimmed = line.trim()
  if (trimmed === '--' || /^[\w.-]+\s*->\s*[\w.-]+/.test(trimmed)) return ''
  const cells = workflowCells(trimmed)
  if (cells.length < 2) return visibleText(line)
  if (isWorkflowTableChrome(cells)) return ''
  return [cells[1], cells[3]].filter(Boolean).join(' · ')
}

function searchUnit(unit: Unit, terms: string[], match: SearchMatch, matcher: Matcher, covered: string[]): SearchHit | null {
  const visible = unit.lines.map((line, index) =>
    unit.type === 'workflow' && index > 0 && !/^\s*<\/?workflow/.test(line) ? workflowText(line) : visibleText(line),
  )
  const joined = visible.join(' ').replace(/\s+/g, ' ').toLowerCase()
  const scores = terms.map((term) => matcher.score(joined, term))
  const matched = terms.filter((_, index) => (scores[index] ?? 0) > 0)
  if (!accepted(matched, terms, match, covered)) return null
  const first = firstMatch(visible, matched, matcher)
  const snippet = snippetAround(first.text, first.index, first.length)
  return {
    ...(unit.blockId ? { blockId: unit.blockId } : {}),
    type: unit.type,
    ...(unit.title ? { title: visibleText(unit.title).trim() } : {}),
    line: unit.startLine + first.offset,
    snippet,
    matched,
    ...fuzzyDetail(matcher, snippet, matched, scores),
  }
}

function searchLines(source: string, terms: string[], match: SearchMatch, matcher: Matcher, covered: string[]): SearchHit[] {
  const lower = source.replace(/\s+/g, ' ').toLowerCase()
  // Every term must still be somewhere in the version; each line that holds one is a hit.
  if (!accepted(terms.filter((term) => matcher.score(lower, term) > 0), terms, match, covered)) return []
  const hits: SearchHit[] = []
  source.split('\n').forEach((line, offset) => {
    const scores = terms.map((term) => matcher.score(line, term))
    const matched = terms.filter((_, index) => (scores[index] ?? 0) > 0)
    if (matched.length === 0) return
    const first = firstMatch([line], matched, matcher)
    const snippet = snippetAround(line, first.index, first.length)
    hits.push({ type: 'line', line: offset + 1, snippet, matched, ...fuzzyDetail(matcher, snippet, matched, scores) })
  })
  return ranked(hits)
}

/** The closeness score and highlight ranges a fuzzy hit carries. An exact hit carries neither. */
function fuzzyDetail(
  matcher: Matcher,
  snippet: string,
  matched: string[],
  scores: number[],
): Pick<SearchHit, 'score' | 'ranges'> {
  if (!matcher.fuzzy) return {}
  return {
    score: Math.round(average(scores.filter((value) => value > 0)) * 1000) / 1000,
    ranges: matcher.ranges(snippet, matched),
  }
}

/**
 * A block is a hit when it holds every term, or one term with `match: 'any'`. With `all`, terms
 * the plan title holds (`covered`) count too, as long as the block holds one of its own and the
 * title does not hold them all already.
 */
function accepted(matched: string[], terms: string[], match: SearchMatch, covered: string[] = []): boolean {
  if (matched.length === 0) return false
  if (match === 'any' || matched.length === terms.length) return true
  if (covered.length === 0 || terms.every((term) => covered.includes(term))) return false
  return terms.every((term) => matched.includes(term) || covered.includes(term))
}

/** The earliest line holding any matched term. A phrase that spans lines falls back to the first line. */
function firstMatch(
  lines: string[],
  matched: string[],
  matcher: Matcher,
): { offset: number; text: string; index: number; length: number } {
  for (let offset = 0; offset < lines.length; offset += 1) {
    const text = lines[offset] ?? ''
    let best: { index: number; length: number } | null = null
    for (const term of matched) {
      const spot = matcher.locate(text, term)
      if (spot && (!best || spot.start < best.index)) best = { index: spot.start, length: spot.end - spot.start }
    }
    if (best) return { offset, text, ...best }
  }
  const offset = Math.max(
    0,
    lines.findIndex((line) => line.trim()),
  )
  return { offset, text: lines[offset] ?? '', index: 0, length: 0 }
}

/** More distinct terms first, then (fuzzy only) the closer match, then position. */
function ranked(hits: SearchHit[]): SearchHit[] {
  return [...hits].sort((a, b) => b.matched.length - a.matched.length || (b.score ?? 1) - (a.score ?? 1) || a.line - b.line)
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

const VISIBLE_ATTRIBUTES = new Set(['title', 'prompt', 'label', 'description', 'options', 'placeholder', 'header', 'detail'])

/** What a reader sees on a source line: tag names, attribute names, and fence markers removed, visible attribute values kept. */
export function visibleText(line: string): string {
  if (/^\s*(```|~~~)/.test(line)) return ''
  return line.replace(/<\/?([A-Za-z][\w.-]*)((?:\s+[\w:.-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|\{[^}]*\}|[^\s>]+))?)*)\s*\/?>/g, (_tag, _name, attributes: string) => {
    const kept: string[] = []
    for (const attribute of attributes.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const name = attribute[1] ?? ''
      if (VISIBLE_ATTRIBUTES.has(name)) kept.push(attribute[2] ?? attribute[3] ?? '')
    }
    return kept.length > 0 ? ` ${kept.join(' ')} ` : ' '
  })
}

function snippetAround(text: string, index: number, length: number): string {
  const flat = text.replace(/\s+/g, ' ')
  const shift = text.slice(0, index).length - text.slice(0, index).replace(/\s+/g, ' ').length
  const at = Math.max(0, index - shift)
  if (flat.trim().length <= SNIPPET_LENGTH) return flat.trim()
  const side = Math.max(0, Math.floor((SNIPPET_LENGTH - length) / 2))
  const start = Math.max(0, Math.min(at - side, flat.length - SNIPPET_LENGTH))
  const end = Math.min(flat.length, start + SNIPPET_LENGTH)
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`
}

function lineAt(source: string, index: number): number {
  let line = 1
  for (let at = 0; at < index; at += 1) if (source.charCodeAt(at) === 10) line += 1
  return line
}
