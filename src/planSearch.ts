import { blockAnchorId } from './parse'
import { preparePlanSource } from './planMdx/frontmatter'
import { buildMdxOutline, legacyPlanSyntaxError } from './planMdx/outline'
import type { PlanBlock } from './types'

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

/** Read `q`, `version`, and `match` from a search URL. */
export function searchParams(url: URL): { query: string; terms: string[]; version: SearchVersion; match: SearchMatch } {
  const query = url.searchParams.get('q') ?? ''
  return {
    query,
    terms: parseSearchQuery(query),
    version: parseSearchVersion(url.searchParams.get('version')),
    match: parseSearchMatch(url.searchParams.get('match')),
  }
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
): { parsed: boolean; hits: SearchHit[] } {
  const normalized = source.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const units = planUnits(normalized)
  if (!units) return { parsed: false, hits: searchLines(normalized, terms, match) }
  const hits: SearchHit[] = []
  for (const unit of units) {
    const hit = searchUnit(unit, terms, match)
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
  version: SearchVersion
  live: SearchDocument | null
  saved: SearchDocument[]
}): SearchResponse {
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
    const result = searchPlanSource(document.source, input.terms, input.match)
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
  versions: DashboardSearchVersion[]
}

export type DashboardSearchResponse = {
  query: string
  terms: string[]
  match: SearchMatch
  version: 'live' | 'all'
  truncated: boolean
  searchedPlans: number
  plans: DashboardSearchPlan[]
}

/** Read `q`, `version`, and `match` for a dashboard search. A version number only applies to one plan. */
export function dashboardSearchParams(url: URL): { query: string; terms: string[]; version: 'live' | 'all'; match: SearchMatch } {
  const params = searchParams(url)
  if (typeof params.version === 'number') {
    throw new SearchRequestError(400, 'A dashboard search takes version=live or version=all. Search one plan for a version number.')
  }
  return { ...params, version: params.version }
}

/**
 * Search every plan a dashboard lists. Only each plan's live document is read unless
 * `version` is `all`. Plans with the most matched terms come first, then the dashboard's order.
 */
export function searchPlans(input: {
  query: string
  terms: string[]
  match: SearchMatch
  version: 'live' | 'all'
  plans: DashboardSearchSource[]
}): DashboardSearchResponse {
  const listed = input.plans.slice(0, DASHBOARD_PLAN_LIMIT)
  let remaining = SEARCH_HIT_LIMIT
  let truncated = input.plans.length > listed.length
  const found: Array<{ plan: DashboardSearchPlan; best: number; hits: number; order: number }> = []
  listed.forEach((plan, order) => {
    const newest = [...plan.documents].sort((a, b) => b.seq - a.seq)
    const live = newest[0]
    if (!live) return
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
      const result = searchPlanSource(document.source, input.terms, input.match)
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
    if (versions.length === 0) return
    const all = versions.flatMap((version) => version.hits)
    found.push({
      plan: { planId: plan.planId, title: live.title || plan.title, url: plan.url, versions },
      best: Math.max(...all.map((hit) => hit.matched.length)),
      hits: all.length,
      order,
    })
  })
  found.sort((a, b) => b.best - a.best || b.hits - a.hits || a.order - b.order)
  return {
    query: input.query,
    terms: input.terms,
    match: input.match,
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
  const cells = trimmed.split('|').map((cell) => cell.trim())
  if (cells.length < 2) return visibleText(line)
  return [cells[1], cells[3]].filter(Boolean).join(' · ')
}

function searchUnit(unit: Unit, terms: string[], match: SearchMatch): SearchHit | null {
  const visible = unit.lines.map((line, index) =>
    unit.type === 'workflow' && index > 0 && !/^\s*<\/?workflow/.test(line) ? workflowText(line) : visibleText(line),
  )
  const joined = visible.join(' ').replace(/\s+/g, ' ').toLowerCase()
  const matched = terms.filter((term) => joined.includes(term))
  if (!accepted(matched, terms, match)) return null
  const first = firstMatch(visible, matched)
  return {
    ...(unit.blockId ? { blockId: unit.blockId } : {}),
    type: unit.type,
    ...(unit.title ? { title: visibleText(unit.title).trim() } : {}),
    line: unit.startLine + first.offset,
    snippet: snippetAround(first.text, first.index, first.length),
    matched,
  }
}

function searchLines(source: string, terms: string[], match: SearchMatch): SearchHit[] {
  const lower = source.replace(/\s+/g, ' ').toLowerCase()
  // Every term must still be somewhere in the version; each line that holds one is a hit.
  if (!accepted(terms.filter((term) => lower.includes(term)), terms, match)) return []
  const hits: SearchHit[] = []
  source.split('\n').forEach((line, offset) => {
    const text = line.toLowerCase()
    const matched = terms.filter((term) => text.includes(term))
    if (matched.length === 0) return
    const first = firstMatch([line], matched)
    hits.push({ type: 'line', line: offset + 1, snippet: snippetAround(line, first.index, first.length), matched })
  })
  return ranked(hits)
}

function accepted(matched: string[], terms: string[], match: SearchMatch): boolean {
  return match === 'all' ? matched.length === terms.length : matched.length > 0
}

/** The earliest line holding any matched term. A phrase that spans lines falls back to the first line. */
function firstMatch(lines: string[], matched: string[]): { offset: number; text: string; index: number; length: number } {
  for (let offset = 0; offset < lines.length; offset += 1) {
    const text = lines[offset] ?? ''
    const lower = text.toLowerCase()
    let best: { index: number; length: number } | null = null
    for (const term of matched) {
      const index = lower.indexOf(term)
      if (index !== -1 && (!best || index < best.index)) best = { index, length: term.length }
    }
    if (best) return { offset, text, ...best }
  }
  const offset = Math.max(
    0,
    lines.findIndex((line) => line.trim()),
  )
  return { offset, text: lines[offset] ?? '', index: 0, length: 0 }
}

function ranked(hits: SearchHit[]): SearchHit[] {
  return [...hits].sort((a, b) => b.matched.length - a.matched.length || a.line - b.line)
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
