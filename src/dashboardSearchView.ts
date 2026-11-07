import type { DashboardSearchResponse, DashboardSearchVersion, SearchHit } from './planSearch'

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
    .dash-search-field {
      flex: 1 1 16rem;
      min-width: 0;
      max-width: 100%;
      height: 36px;
      padding: 0 14px;
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
    .dash-search-results { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; max-width: 100%; }
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
    .dash-search-snippet mark { background: var(--accent-soft); color: inherit; border-radius: 3px; padding: 0 1px; }
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

/** Split a snippet so each matched term can be marked. */
export function highlightParts(snippet: string, terms: string[]): Array<{ text: string; match: boolean }> {
  const lower = snippet.toLowerCase()
  const parts: Array<{ text: string; match: boolean }> = []
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

/** "3 matches in 2 plans, live text only." */
export function searchSummary(result: DashboardSearchResponse): string {
  const hits = result.plans.reduce(
    (sum, plan) => sum + plan.versions.reduce((count, version) => count + version.hits.length, 0),
    0,
  )
  const scope = result.version === 'all' ? 'live text and saved versions' : 'live text only'
  if (hits === 0) return `No matches in ${result.searchedPlans} ${result.searchedPlans === 1 ? 'plan' : 'plans'}, ${scope}.`
  const plans = result.plans.length
  const more = result.truncated ? ' Some results were left out; narrow the search to see them.' : ''
  return `${hits} ${hits === 1 ? 'match' : 'matches'} in ${plans} ${plans === 1 ? 'plan' : 'plans'}, ${scope}.${more}`
}
