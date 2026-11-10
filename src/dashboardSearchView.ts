import type { DashboardSearchPlan, DashboardSearchResponse, DashboardSearchVersion, SearchHit } from './planSearch'

/** Shortest query the field searches while someone types. Enter searches any length. */
export const SEARCH_MIN_TYPED = 2
/** Most often the field sends a search while someone types. */
export const SEARCH_THROTTLE_MS = 300

/**
 * Call `run` at most once per `wait` ms. The first call after a pause runs at once and the last
 * call in a burst always runs, so the final text is always searched. Self-contained: the local
 * dashboard script inlines it with `toString()`.
 */
export function throttle<A extends unknown[]>(
  run: (...args: A) => void,
  wait: number,
): ((...args: A) => void) & { cancel: () => void; flush: () => void } {
  let last = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null
  const fire = () => {
    timer = null
    if (!pending) return
    const args = pending
    pending = null
    last = Date.now()
    run(...args)
  }
  const call = (...args: A) => {
    pending = args
    if (timer) return
    const left = wait - (Date.now() - last)
    if (left <= 0) fire()
    else timer = setTimeout(fire, left)
  }
  call.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
    pending = null
  }
  call.flush = () => {
    if (timer) clearTimeout(timer)
    timer = null
    fire()
  }
  return call
}

/** Styles for the dashboard search row and its results. Both dashboards use them, on the same tokens. */
export function dashboardSearchCss(): string {
  return `
    .dash-search, .dash-search *, .dash-search-results, .dash-search-results * { box-sizing: border-box; }
    .dash-search {
      max-width: 100%;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-xs) var(--space-md);
      margin: 0;
    }
    .dash-search-box {
      position: relative;
      flex: 1 1 16rem;
      min-width: 0;
      max-width: 100%;
      display: flex;
    }
    .dash-search-icon {
      position: absolute;
      left: 13px;
      top: 50%;
      width: 16px;
      height: 16px;
      margin-top: -8px;
      color: var(--muted);
      pointer-events: none;
    }
    .dash-search-icon svg { display: block; width: 16px; height: 16px; }
    .dash-search-icon .dash-spinner { position: absolute; inset: 1px; }
    .dash-search-box[data-busy] .dash-search-glass { visibility: hidden; }
    .dash-search-box:not([data-busy]) .dash-spinner { display: none; }
    .dash-search-field {
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      height: 36px;
      padding: 0 14px 0 36px;
      border: 1px solid var(--hairline-strong, var(--line));
      border-radius: 999px;
      background: var(--canvas, transparent);
      color: var(--ink);
      font: inherit;
      font-size: 14px;
    }
    .dash-search-field:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .dash-search-option {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 14px;
      white-space: nowrap;
    }
    .dash-search-option input { accent-color: var(--accent); margin: 0; }
    .dash-search-actions { display: inline-flex; gap: var(--space-xs); }
    .dash-search-note { margin: 0 0 12px; color: var(--muted); font-size: 14px; line-height: 1.5; }
    .dash-search-note-row { display: flex; align-items: center; gap: var(--space-xs); flex-wrap: wrap; margin: 0 0 12px; }
    .dash-search-note-row .dash-search-note { margin: 0; }
    .dash-search-results { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; max-width: 100%; transition: opacity 150ms ease; }
    .dash-search-results[aria-busy="true"] { opacity: 0.55; }
    .dash-search-title-match { display: block; margin: -2px 0 2px; color: var(--muted); font-size: 0.8rem; }
    .dash-search-plan {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel);
      padding: 14px 16px;
      min-width: 0;
    }
    .dash-search-plan h3 { margin: 0 0 6px; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
    .dash-search-plan h3 a { color: var(--ink); text-decoration: none; text-underline-offset: 3px; }
    .dash-search-plan h3 a:hover { text-decoration: underline; }
    .dash-search-version + .dash-search-version { margin-top: 8px; }
    .dash-search-version-label {
      display: inline-flex;
      border-radius: 999px;
      padding: 0.1rem 0.5rem;
      margin: 4px 0;
      font-size: 0.75rem;
      font-weight: 600;
      background: var(--accent-soft);
      color: var(--ink);
    }
    .dash-search-version-label.saved { background: var(--warn-soft); color: var(--warn); }
    .dash-search-hits { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
    .dash-search-hit { display: block; padding: 6px 8px; margin: 0 -8px; border-radius: 10px; color: inherit; text-decoration: none; min-width: 0; }
    a.dash-search-hit:hover { background: var(--canvas, rgba(127, 127, 127, 0.08)); }
    a.dash-search-hit:focus-visible { outline: 2px solid var(--accent); outline-offset: 0; }
    .dash-search-where { display: block; color: var(--muted); font-size: 0.8rem; overflow-wrap: anywhere; }
    .dash-search-snippet { display: block; font-size: 0.9rem; line-height: 1.45; overflow-wrap: anywhere; }
    .dash-search-snippet mark, .dash-search-plan h3 mark { background: var(--accent-soft); color: inherit; border-radius: 3px; padding: 0 1px; }
  `
}

/** "phase · Confirm design · line 44" for one hit. */
export function hitWhere(hit: SearchHit): string {
  const kind = hit.type === 'line' ? 'line' : hit.type
  // When the match is the title line itself, the snippet already shows the title.
  const name = hit.title && hit.snippet.trim() === hit.title.trim() ? hit.blockId : hit.title || hit.blockId
  return [kind, name, `line ${hit.line}`].filter(Boolean).join(' · ')
}

/** Link for one hit: the version's page, at the matched block when it has one. */
export function hitHref(version: DashboardSearchVersion, hit: SearchHit): string | null {
  if (!version.url) return null
  return hit.blockId ? `${version.url}#${encodeURIComponent(hit.blockId)}` : version.url
}

export function versionLabel(version: DashboardSearchVersion): string {
  return version.live ? 'Live' : `Version ${version.seq}`
}

/**
 * Split a snippet so each match can be marked. A fuzzy result sends the `[start, end)` ranges to
 * mark. Without them every exact occurrence of a term is marked.
 */
export function highlightParts(
  snippet: string,
  terms: string[],
  ranges?: Array<[number, number]> | null,
): Array<{ text: string; match: boolean }> {
  const parts: Array<{ text: string; match: boolean }> = []
  if (ranges && ranges.length > 0) {
    let from = 0
    for (const range of ranges) {
      const start = Math.max(from, Math.min(Number(range[0]) || 0, snippet.length))
      const end = Math.min(snippet.length, Number(range[1]) || 0)
      if (end <= start) continue
      if (start > from) parts.push({ text: snippet.slice(from, start), match: false })
      parts.push({ text: snippet.slice(start, end), match: true })
      from = end
    }
    if (from < snippet.length) parts.push({ text: snippet.slice(from), match: false })
    return parts
  }
  const lower = snippet.toLowerCase()
  let at = 0
  while (at < snippet.length) {
    let next = -1
    let length = 0
    for (const term of terms) {
      if (!term) continue
      const index = lower.indexOf(term, at)
      if (index !== -1 && (next === -1 || index < next || (index === next && term.length > length))) {
        next = index
        length = term.length
      }
    }
    if (next === -1) {
      parts.push({ text: snippet.slice(at), match: false })
      break
    }
    if (next > at) parts.push({ text: snippet.slice(at, next), match: false })
    parts.push({ text: snippet.slice(next, next + length), match: true })
    at = next + length
  }
  return parts
}

/** Where a result's plan title links: the plan page, or its newest saved version on the host. */
export function planOpenUrl(plan: Pick<DashboardSearchPlan, 'url' | 'openUrl'>): string | null {
  return plan.openUrl ?? plan.url ?? null
}

/** "3 matches in 2 plans, live text only." A matched plan title counts as one match. */
export function searchSummary(result: DashboardSearchResponse): string {
  const hits = result.plans.reduce(
    (sum, plan) =>
      sum +
      (plan.titleMatched && plan.titleMatched.length > 0 ? 1 : 0) +
      plan.versions.reduce((count, version) => count + version.hits.length, 0),
    0,
  )
  const scope = result.version === 'all' ? 'live text and saved versions' : 'live text only'
  if (hits === 0) return `No matches in ${result.searchedPlans} ${result.searchedPlans === 1 ? 'plan' : 'plans'}, ${scope}.`
  const plans = result.plans.length
  const more = result.truncated ? ' Some results were left out; narrow the search to see them.' : ''
  return `${hits} ${hits === 1 ? 'match' : 'matches'} in ${plans} ${plans === 1 ? 'plan' : 'plans'}, ${scope}.${more}`
}

/**
 * Text listing for `live-plan search` without `--url`: one heading per plan with its link,
 * then one line per hit. `base` turns the host's relative links into full URLs.
 */
export function formatDashboardSearch(result: DashboardSearchResponse, base?: string): string {
  const absolute = (value: string | null): string | null => {
    if (!value) return null
    try {
      return base ? new URL(value, base).href : value
    } catch {
      return value
    }
  }
  const lines: string[] = []
  for (const plan of result.plans) {
    const link = absolute(plan.openUrl ?? plan.url)
    lines.push(`${plan.title || 'Untitled plan'}${link ? `  ${link}` : ''}`)
    if (plan.titleMatched && plan.titleMatched.length > 0) lines.push(`  title  ${plan.titleMatched.join(', ')}`)
    for (const version of plan.versions) {
      const versionLink = absolute(version.url)
      const opens = version.live && versionLink === link ? '' : versionLink ? `  ${versionLink}` : ''
      lines.push(`  ${version.live ? 'live' : `v${version.seq}`}${version.parsed ? '' : '  (searched line by line: this version does not parse)'}${opens}`)
      for (const hit of version.hits) {
        const where = [hit.type, hit.blockId ?? hit.title].filter(Boolean).join('  ')
        lines.push(`    ${where}  L${hit.line}  ${hit.snippet}`)
      }
    }
    lines.push('')
  }
  lines.push(searchSummary(result))
  return lines.join('\n')
}
