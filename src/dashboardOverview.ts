import type { PlanActivity } from './dashboard'

/**
 * The parts both dashboards draw the same way: the three summary cards (Plans, Open now, Work),
 * the status bar and its legend, the status pill, and the details of a plan row. The loopback page
 * builds them with DOM calls and the hosted page with React, from the same classes, icons, and CSS.
 */

const svg = (viewBox: string, body: string, extra = '') =>
  `<svg viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${body}</svg>`

/**
 * One glyph per row status, from the plan page's status set (DESIGN.md D4): a progress ring while an
 * agent works, an empty dashed ring while the plan waits, a check disc when it ran, and a ban when it
 * stopped. The pill's label names it, so the state never rests on color alone.
 */
export const ACTIVITY_GLYPH_SVG: Record<PlanActivity, string> = {
  active: svg(
    '0 0 16 16',
    '<circle cx="8" cy="8" r="6" opacity="0.28"/><path d="M14 8a6 6 0 0 0-6-6"/>',
  ),
  idle: svg(
    '0 0 24 24',
    '<path d="M10.1 2.182a10 10 0 0 1 3.8 0"/><path d="M13.9 21.818a10 10 0 0 1-3.8 0"/><path d="M17.609 3.721a10 10 0 0 1 2.69 2.7"/><path d="M2.182 13.9a10 10 0 0 1 0-3.8"/><path d="M20.279 17.609a10 10 0 0 1-2.7 2.69"/><path d="M21.818 10.1a10 10 0 0 1 0 3.8"/><path d="M3.721 6.391a10 10 0 0 1 2.7-2.69"/><path d="M6.391 20.279a10 10 0 0 1-2.69-2.7"/>',
  ),
  executed: svg('0 0 24 24', '<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>'),
  interrupted: svg('0 0 24 24', '<circle cx="12" cy="12" r="10"/><path d="M4.929 4.929 19.07 19.071"/>'),
}

/** Lucide `folder`, before the folder a plan is linked to. */
export const FOLDER_ICON_SVG = svg(
  '0 0 24 24',
  '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
)

/** Lucide `git-branch`, before the branch the plan's folder is on. */
export const BRANCH_ICON_SVG = svg(
  '0 0 24 24',
  '<path d="M15 6a9 9 0 0 0-9 9V3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>',
)

/** Which way a row's completion meter reads: finished, stopped short, or still going. */
export type ProgressTone = 'complete' | 'stopped' | 'open'

export function progressTone(plan: { status: string; completionState?: string | null }): ProgressTone {
  if (plan.completionState === 'complete') return 'complete'
  if (plan.status === 'interrupted') return 'stopped'
  return 'open'
}

/** Placeholder cards while the first numbers load, shaped like the three summary cards. */
export function overviewSkeletonHtml(): string {
  const card = (wide: boolean, lines: number) =>
    `<article class="dash-card dash-card-skeleton${wide ? ' dash-card-plans' : ''}" aria-hidden="true">` +
    '<span class="dash-skeleton skel-eyebrow"></span><span class="dash-skeleton skel-figure"></span>' +
    (wide ? '<span class="dash-skeleton skel-bar"></span>' : '') +
    '<span class="dash-skeleton skel-line"></span>'.repeat(lines) +
    '</article>'
  return card(true, 1) + card(false, 2) + card(false, 2)
}

/** Number of summary cards. */
export const OVERVIEW_CARDS = 3

/**
 * Status colors for the bar, its legend, the pills, and the meters. Light values are the design
 * system's status tokens. Dark values are stepped so neighbors in the bar stay apart for color-blind
 * readers (checked with the dataviz palette validator: adjacent CVD ΔE ≥ 9.6, all ≥ 3:1 on the
 * dark surface). The pill tints are the change-tag pairs, which keep 4.5:1 text in both themes.
 */
export function dashboardOverviewCss(): string {
  return `
    :root {
      --dash-active: #0094fc;
      --dash-idle: #a1a1aa;
      --dash-executed: #0a7a38;
      --dash-interrupted: #c98a00;
      --dash-active-bg: #dbeafe;
      --dash-active-fg: #1e40af;
      --dash-executed-bg: #dcf5e2;
      --dash-executed-fg: #0a7a38;
      --dash-interrupted-bg: #fff3d6;
      --dash-interrupted-fg: #8a5300;
      --dash-track: color-mix(in srgb, var(--ink) 8%, transparent);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --dash-idle: #737373;
        --dash-executed: #22a855;
        --dash-interrupted: #e0b43a;
        --dash-active-bg: #12294a;
        --dash-active-fg: #a8cdff;
        --dash-executed-bg: #0f2e1b;
        --dash-executed-fg: #4ade80;
        --dash-interrupted-bg: #33270a;
        --dash-interrupted-fg: #f5c451;
        --dash-track: color-mix(in srgb, var(--ink) 12%, transparent);
      }
    }
    [data-activity="active"] { --dash-tone: var(--dash-active); }
    [data-activity="idle"] { --dash-tone: var(--dash-idle); }
    [data-activity="executed"] { --dash-tone: var(--dash-executed); }
    [data-activity="interrupted"] { --dash-tone: var(--dash-interrupted); }

    .period-bar {
      display: flex;
      align-items: center;
      gap: var(--space-sm) var(--space-md);
      flex-wrap: wrap;
    }
    .period-bar .dash-status-row { flex: 1 1 16rem; min-width: 0; margin: 0; }
    .period-bar .status { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.5; }
    /* A narrow window scrolls the tabs inside their pill rather than past the page edge. */
    .tabs { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
    .tabs::-webkit-scrollbar { display: none; }
    .tabs > * { flex: none; }
    .dash-glyph { display: inline-flex; flex: none; }
    .dash-glyph svg { display: block; }

    .dash-overview {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr);
      gap: var(--space-md);
      margin: 0;
    }
    .dash-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
      min-width: 0;
      padding: var(--space-md);
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel);
    }
    .dash-eyebrow {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.4;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .dash-figure {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 2px var(--space-xs);
      margin: 0;
    }
    .dash-figure strong {
      color: var(--ink);
      font-size: 28px;
      font-weight: 600;
      line-height: 1.2;
    }
    .dash-figure span { color: var(--muted); font-size: 14px; line-height: 1.4; }
    /* The one hero figure on the page: the period's plan count. Proportional digits at this size. */
    .dash-figure.hero strong { font-size: 48px; line-height: 1.1; letter-spacing: -1px; }

    /* Thin segmented bar: one part per status, widths in proportion, a 2px gap of the card between. */
    .dash-seg {
      display: flex;
      gap: 2px;
      height: 8px;
      margin: 0;
    }
    /* The bar and legend sit at the card's foot, level with the other cards' last rows. */
    .dash-card-plans .dash-seg { margin-top: auto; }
    .dash-seg-part {
      flex: var(--dash-count, 0) 1 0;
      min-width: 6px;
      border-radius: 999px;
      background: var(--dash-tone);
    }
    .dash-seg-part.empty { flex: 1 1 0; background: var(--dash-track); }
    .dash-legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs) var(--space-md);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .dash-legend li {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.4;
    }
    .dash-swatch { width: 10px; height: 10px; flex: none; border-radius: 3px; background: var(--dash-tone); }
    .dash-legend strong { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }

    .dash-facts { display: grid; gap: 0; margin: auto 0 0; }
    .dash-facts > div {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--space-sm);
      padding: 6px 0;
      border-top: 1px solid var(--line);
      font-size: 14px;
      line-height: 1.4;
    }
    .dash-facts > div:last-child { padding-bottom: 0; }
    .dash-facts dt { color: var(--muted); }
    .dash-facts dd { margin: 0; color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; }
    .dash-facts dd small { color: var(--muted); font-size: inherit; font-weight: 400; }

    .dash-card-skeleton .skel-eyebrow { height: 10px; width: 30%; }
    .dash-card-skeleton .skel-figure { height: 28px; width: 22%; }
    .dash-card-skeleton.dash-card-plans .skel-figure { height: 44px; }
    .dash-card-skeleton .skel-bar { height: 8px; width: 100%; border-radius: 999px; }
    .dash-card-skeleton .skel-line { height: 12px; width: 70%; }

    .dash-footnote { margin: var(--space-xl) 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; max-width: 72rem; }

    .dash-sr {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    /* Plans table */
    caption .caption-count {
      margin-left: var(--space-xs);
      color: var(--muted);
      font-size: 14px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .table-wrap .plan-group th {
      padding: 14px 16px 6px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.4;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .table-wrap .plan-group th span { margin-left: 6px; letter-spacing: 0; font-variant-numeric: tabular-nums; }
    .table-wrap tbody + tbody .plan-group th { border-top: 1px solid var(--line); }
    .plan-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 12px;
      margin-top: 4px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.4;
    }
    .plan-meta-item { display: inline-flex; align-items: center; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
    .plan-meta-item svg { width: 13px; height: 13px; }
    .plan-meta-item.mono { font-family: var(--font-mono); font-size: 12px; }
    .plan-mode {
      display: inline-flex;
      align-items: center;
      height: 20px;
      padding: 0 7px;
      border: 1px solid var(--hairline-strong);
      border-radius: 999px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 500;
      text-transform: capitalize;
    }
    .plan-file {
      display: block;
      margin-top: 4px;
      color: var(--muted);
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }
    .dash-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 24px;
      padding: 0 9px 0 7px;
      border-radius: 999px;
      font-size: 12.5px;
      font-weight: 600;
      line-height: 1;
      white-space: nowrap;
    }
    .dash-pill svg { width: 14px; height: 14px; flex: none; }
    .dash-pill[data-activity="active"] { background: var(--dash-active-bg); color: var(--dash-active-fg); }
    .dash-pill[data-activity="idle"] { color: var(--muted); box-shadow: inset 0 0 0 1px var(--hairline-strong); }
    .dash-pill[data-activity="executed"] { background: var(--dash-executed-bg); color: var(--dash-executed-fg); }
    .dash-pill[data-activity="interrupted"] { background: var(--dash-interrupted-bg); color: var(--dash-interrupted-fg); }
    .table-wrap .sub.plan-ask { color: var(--ink); font-weight: 600; }
    .plan-progress { display: flex; align-items: center; gap: var(--space-xs); }
    .plan-meter {
      flex: 0 0 7.5rem;
      height: 6px;
      overflow: hidden;
      border-radius: 999px;
      background: color-mix(in srgb, var(--dash-meter) 18%, transparent);
    }
    .plan-meter span { display: block; height: 100%; border-radius: 999px; background: var(--dash-meter); }
    .plan-progress { --dash-meter: var(--dash-active); }
    .plan-progress[data-tone="complete"] { --dash-meter: var(--dash-executed); }
    .plan-progress[data-tone="stopped"] { --dash-meter: var(--dash-interrupted); }
    .plan-percent { min-width: 4ch; color: var(--ink); font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .plan-time { display: block; color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; }

    @media (max-width: 1040px) {
      .dash-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .dash-overview .dash-card-plans { grid-column: 1 / -1; }
    }
    @media (max-width: 600px) {
      .period-bar .dash-status-row { order: 3; flex-basis: 100%; }
      .period-bar #refresh, .period-bar .titlebar-action { margin-left: auto; }
      .dash-overview { grid-template-columns: minmax(0, 1fr); }
      .dash-figure.hero strong { font-size: 40px; }
    }
    /* A narrow window reads each plan as a card: the plan on top, then status and progress side by
       side, then its times on one line. The header row stays for screen readers. */
    @media (max-width: 720px) {
      .table-wrap table { min-width: 0; }
      .table-wrap thead {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .table-wrap tbody tr:not(.plan-group) {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
        gap: 10px 16px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--line);
      }
      .table-wrap tbody:last-child tr:last-child { border-bottom: 0; }
      .table-wrap tbody tr:not(.plan-group) > td { display: block; padding: 0; border: 0; min-width: 0; }
      .table-wrap td.plan-cell { grid-column: 1 / 3; }
      .table-wrap td.plan-actions-cell { grid-column: 3; grid-row: 1; }
      .table-wrap td.plan-time-cell,
      .table-wrap td.empty { grid-column: 1 / -1; }
      .table-wrap td.plan-time-cell > * { display: inline; }
      .table-wrap td.plan-time-cell > * + *::before { content: " · "; color: var(--muted); }
      .table-wrap .plan-group,
      .table-wrap .plan-group th { display: block; }
      .plan-meter { flex-basis: 4.5rem; }
    }
  `
}
