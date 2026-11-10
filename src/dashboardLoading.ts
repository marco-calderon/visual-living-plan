/**
 * Loading states for both dashboards: skeleton stat cards, table rows, and search results while
 * nothing has arrived yet, a dimmed view while newer rows are on the way, and a small spinner.
 * The loopback page renders these strings. The hosted page renders the same classes in React.
 */

/** Number of stat cards the summary shows. */
export const STAT_SKELETONS = 7
/** Rows the plan table shows before the first answer. */
export const ROW_SKELETONS = 4

/** Bar widths per skeleton row, so the placeholder does not read as one repeated block. */
export const ROW_SKELETON_WIDTHS: Array<{ title: string; sub: string; path: string; when: string }> = [
  { title: '180px', sub: '64px', path: '300px', when: '108px' },
  { title: '140px', sub: '52px', path: '260px', when: '116px' },
  { title: '210px', sub: '72px', path: '320px', when: '104px' },
  { title: '160px', sub: '58px', path: '240px', when: '112px' },
]

export function dashboardLoadingCss(): string {
  return `
    .dash-skeleton {
      display: block;
      height: 12px;
      max-width: 100%;
      border-radius: 6px;
      background: color-mix(in srgb, var(--ink) 8%, transparent);
    }
    .dash-skeleton.pill { border-radius: 999px; }
    .stat-skeleton .dash-skeleton { height: 13px; width: 58%; }
    .stat-skeleton .dash-skeleton + .dash-skeleton { height: 26px; width: 36%; margin-top: 0.45rem; }
    .row-skeleton td { vertical-align: middle; }
    .row-skeleton .dash-skeleton + .dash-skeleton { margin-top: 8px; }
    .row-skeleton .skel-title { height: 14px; }
    .row-skeleton .skel-sub { height: 10px; }
    .row-skeleton .skel-pill { height: 22px; width: 64px; border-radius: 999px; }
    .row-skeleton .skel-meter { height: 6px; width: 7.5rem; border-radius: 999px; }
    .search-skeleton .dash-skeleton + .dash-skeleton { margin-top: 10px; }
    .search-skeleton .skel-heading { height: 15px; width: 44%; }
    .search-skeleton .skel-label { height: 18px; width: 48px; border-radius: 999px; }
    .search-skeleton .skel-where { height: 10px; width: 30%; }
    .search-skeleton .skel-line { height: 12px; width: 86%; }
    .dash-pending { opacity: 0.55; transition: opacity 150ms ease; }
    .dash-spinner {
      display: inline-block;
      flex: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid color-mix(in srgb, var(--muted) 30%, transparent);
      border-top-color: var(--accent);
      vertical-align: -2px;
    }
    .dash-status-row { display: flex; align-items: center; gap: var(--space-xs); }
    .dash-status-row > .status { margin: 0; }
    .dash-retry { margin-left: var(--space-xs); }
    @keyframes dash-spin { to { transform: rotate(360deg); } }
    @keyframes dash-shimmer {
      from { background-position: 100% 0; }
      to { background-position: -100% 0; }
    }
    .dash-spinner, .dash-spin svg, svg.dash-spin { animation: dash-spin 0.8s linear infinite; }
    @media (prefers-reduced-motion: no-preference) {
      .dash-skeleton {
        background: linear-gradient(
          90deg,
          color-mix(in srgb, var(--ink) 8%, transparent) 30%,
          color-mix(in srgb, var(--ink) 4%, transparent) 50%,
          color-mix(in srgb, var(--ink) 8%, transparent) 70%
        );
        background-size: 200% 100%;
        animation: dash-shimmer 1.4s ease-in-out infinite;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .dash-spinner, .dash-spin svg, svg.dash-spin { animation-duration: 1.6s; }
      .dash-pending { transition: none; }
    }
  `
}

/** Stat card placeholders, hidden from assistive tech: the status line says what is loading. */
export function statSkeletonHtml(): string {
  const card =
    '<article class="stat stat-skeleton" aria-hidden="true"><span class="dash-skeleton"></span><span class="dash-skeleton"></span></article>'
  return Array.from({ length: STAT_SKELETONS }, () => card).join('')
}

/** Plan table placeholder rows. */
export function rowSkeletonHtml(): string {
  return ROW_SKELETON_WIDTHS.slice(0, ROW_SKELETONS)
    .map(
      (width) =>
        `<tr class="row-skeleton" aria-hidden="true">` +
        `<td><span class="dash-skeleton skel-title" style="width:${width.title}"></span><span class="dash-skeleton skel-sub" style="width:${width.sub}"></span><span class="dash-skeleton skel-sub" style="width:${width.path}"></span></td>` +
        `<td><span class="dash-skeleton skel-pill"></span></td>` +
        `<td><span class="dash-skeleton skel-meter"></span><span class="dash-skeleton skel-sub" style="width:96px"></span></td>` +
        `<td><span class="dash-skeleton skel-sub" style="width:${width.when}"></span></td>` +
        `<td></td>` +
        `</tr>`,
    )
    .join('')
}

/** Search result placeholders: two plan cards with a few hit lines each. */
export function searchSkeletonHtml(): string {
  const hit = '<span class="dash-skeleton skel-where"></span><span class="dash-skeleton skel-line"></span>'
  const card = (lines: number) =>
    `<article class="dash-search-plan search-skeleton" aria-hidden="true"><span class="dash-skeleton skel-heading"></span><span class="dash-skeleton skel-label"></span>${hit.repeat(lines)}</article>`
  return card(2) + card(1)
}
