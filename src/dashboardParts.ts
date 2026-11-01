import { hostToolbarCss } from './hostToolbar'

/** Dashboard document CSS, shared by the loopback page and the Start route. */
export function dashboardDocumentCss(): string {
  return `    :root {
      color-scheme: light;
      --ink: #18181b;
      --charcoal: #27272a;
      --muted: #71717a;
      --canvas: #ffffff;
      --surface: #f4f4f5;
      --paper: var(--canvas);
      --panel: var(--surface);
      --hairline: #e4e4e7;
      --line: var(--hairline);
      --accent: #1d4ed8;
      --primary: #09090b;
      --on-primary: #ffffff;
      --accent-soft: #dbeafe;
      --good: #166534;
      --good-soft: #dcfce7;
      --warn: #9a3412;
      --warn-soft: #ffedd5;
      --shadow: none;
      --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
      --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        color-scheme: dark;
        --ink: #fafafa;
        --charcoal: #e4e4e7;
        --muted: #a1a1aa;
        --canvas: #0c0c0e;
        --surface: #18181b;
        --paper: var(--canvas);
        --panel: var(--surface);
        --hairline: #27272a;
        --line: var(--hairline);
        --accent: #93c5fd;
        --primary: #fafafa;
        --on-primary: #0c0c0e;
        --accent-soft: rgba(147, 197, 253, 0.14);
        --good: #86efac;
        --good-soft: rgba(134, 239, 172, 0.12);
        --warn: #fdba74;
        --warn-soft: rgba(253, 186, 116, 0.12);
        --shadow: none;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--charcoal);
      font-family: "DM Sans", Inter, "Helvetica Neue", Helvetica, Arial, sans-serif;
      background: var(--canvas);
    }
    main { margin: 0; padding: 24px 32px 64px; }
    ${hostToolbarCss}
    .tab-label:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .dash-section { display: grid; gap: 16px; margin: 0 0 24px; }
    .dash-section:last-child { margin-bottom: 0; }
    .section-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .tabs {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 3px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--surface);
    }
    .tab-label,
    .titlebar-action {
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      line-height: 1.4;
      cursor: pointer;
    }
    .tab-label {
      border: 0;
      background: transparent;
      color: var(--ink);
      border-radius: 999px;
      padding: 8px 12px;
    }
    .tab-label[aria-pressed="true"] {
      background: var(--primary);
      color: var(--on-primary);
    }
    .lede {
      margin: 0 0 8px;
      color: var(--muted);
      max-width: 72rem;
      font-size: 14px;
      line-height: 1.5;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
      margin: 0;
    }
    .stat {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
      box-shadow: none;
    }
    .stat span { display: block; color: var(--muted); font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase; }
    .stat strong {
      display: block;
      margin-top: 0.25rem;
      font-family: "DM Sans", Inter, "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-weight: 600;
      color: var(--ink);
      font-size: 1.7rem;
      font-variant-numeric: tabular-nums;
    }
    .status { color: var(--muted); margin: 0 0 16px; font-size: 14px; line-height: 1.5; }
    .table-wrap {
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel);
      box-shadow: var(--shadow);
    }
    table { width: 100%; border-collapse: collapse; min-width: 860px; }
    caption {
      text-align: left;
      padding: 16px 16px 0;
      font-weight: 600;
      color: var(--ink);
      font-size: 20px;
      line-height: 1.4;
    }
    th, td {
      text-align: left;
      padding: 12px 16px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 600;
    }
    tr:last-child td { border-bottom: 0; }
    .title { font-weight: 600; }
    .sub { display: block; margin-top: 0.2rem; color: var(--muted); font-size: 0.82rem; line-height: 1.4; }
    .path {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.75rem;
      overflow-wrap: break-word;
    }
    .pill {
      display: inline-flex;
      border-radius: 999px;
      padding: 0.15rem 0.5rem;
      font-size: 0.78rem;
      font-weight: 600;
      background: var(--accent-soft);
      color: var(--ink);
    }
    .pill.executed { background: var(--good-soft); color: var(--good); }
    .pill.interrupted { background: var(--warn-soft); color: var(--warn); }
    .meter {
      width: 7.5rem;
      height: 0.4rem;
      border-radius: 999px;
      background: var(--line);
      overflow: hidden;
      margin-bottom: 0.3rem;
    }
    .meter span { display: block; height: 100%; background: var(--accent); }
    .tab-label {
      transition: transform 160ms var(--ease-out), background-color 150ms ease, color 150ms ease, border-color 150ms ease;
    }
    .tab-label:active { transform: scale(0.97); }
    @media (prefers-reduced-motion: reduce) {
      .tab-label { transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease; }
      .tab-label:active { transform: none; }
    }
    @media (prefers-reduced-motion: no-preference) {
      @keyframes enter {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: none; }
      }
      @keyframes row-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .dash-section {
        animation: enter 200ms var(--ease-out) both;
      }
      .dash-section:nth-child(2) { animation-delay: 80ms; }
      .stat.enter { animation: enter 200ms var(--ease-out) both; }
      tbody tr.enter { animation: row-in 150ms var(--ease-out) both; }
    }
    .num { font-variant-numeric: tabular-nums; }
    a.action {
      color: var(--accent);
      font-weight: 600;
      text-decoration: none;
      margin-right: 0.7rem;
      white-space: nowrap;
    }
    a.action:hover { text-decoration: underline; }
    .empty { color: var(--muted); }
    .account-card {
      display: grid;
      gap: 12px;
      margin: 0 0 16px;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel);
    }
    .account-row { display: flex; gap: 12px 24px; align-items: baseline; flex-wrap: wrap; }
    .account-card p { margin: 0; color: var(--muted); line-height: 1.5; }
    .account-identity { color: var(--ink); font-weight: 600; }
    .account-meta strong { color: var(--ink); font-weight: 600; }
    .account-note code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.86em;
    }`
}

/** Dashboard table and summary, without the document shell. */
export function dashboardMainHtml(lede: string): string {
  return `  <main>
    <section class="dash-section" aria-label="Summary">
      <div class="section-bar">
        <div class="tabs" role="group" aria-label="Summary period">
          <button type="button" class="tab-label" data-period="day" aria-pressed="true">Today</button>
          <button type="button" class="tab-label" data-period="week" aria-pressed="false" aria-label="This week">Week</button>
          <button type="button" class="tab-label" data-period="month" aria-pressed="false" aria-label="This month">Month</button>
        </div>
        <button type="button" class="titlebar-action" id="refresh">Refresh</button>
      </div>
      <section class="stats" id="stats" aria-live="polite"></section>
      <p class="lede">${lede}</p>
      <p class="status" id="status">Loading…</p>
    </section>
    <section class="dash-section" aria-label="Plans">
      <div class="section-bar">
        <div class="tabs" role="group" aria-label="Plan status">
          <button type="button" class="tab-label" data-filter="all" aria-pressed="true">All</button>
          <button type="button" class="tab-label" data-filter="running" aria-pressed="false">Running</button>
          <button type="button" class="tab-label" data-filter="executed" aria-pressed="false">Executed</button>
          <button type="button" class="tab-label" data-filter="interrupted" aria-pressed="false">Interrupted</button>
        </div>
      </div>
      <div class="table-wrap">
      <table>
        <caption>Plans</caption>
        <thead>
          <tr>
            <th scope="col">Plan</th>
            <th scope="col">Status</th>
            <th scope="col">Completion</th>
            <th scope="col">Folder</th>
            <th scope="col">Files</th>
            <th scope="col">Started</th>
            <th scope="col">Duration</th>
            <th scope="col"></th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
      </div>
    </section>
  </main>`
}
