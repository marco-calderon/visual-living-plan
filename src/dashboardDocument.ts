export type DashboardDocumentInput = {
  lede?: string
  /** Extra titlebar controls, after the period, status, and refresh tools. */
  toolbarHtml?: string
  /** Cloud dashboard only. The local dashboard leaves this empty. */
  accountHtml?: string
  /** Logo target. Local opens running plans. The cloud host opens this dashboard. */
  logoHref?: string
  apiPath?: string
  host?: 'local' | 'cloud'
  headExtra: string
  footScript: string
}

const defaultLede = 'Running plans and plans that have already executed. Summaries follow the local day, week, and month. Files modified is the largest git change set seen during the run. Each plan file is kept in the registry\'s plans folder.'
const defaultToolbar = '<a class="titlebar-action" href="/">Running plans</a>'

/** Control dashboard document. Loopback and the cloud host share this layout. */
export function renderDashboardDocument(options: DashboardDocumentInput): string {
  const input = {
    lede: options.lede ?? defaultLede,
    toolbarHtml: options.toolbarHtml ?? defaultToolbar,
    accountHtml: options.accountHtml ?? '',
    logoHref: options.logoHref ?? '/',
    apiPath: options.apiPath ?? '/api/dashboard',
    headExtra: options.headExtra,
    footScript: options.footScript,
  }
  const hostAttr = options.host === 'cloud' ? ' data-plan-host="cloud"' : ''
  return `<!doctype html>
<html lang="en"${hostAttr}>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${input.headExtra}
  <title>Plan dashboard · Living Plan</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      color-scheme: light;
      --ink: #18181b;
      --charcoal: #27272a;
      --muted: #71717a;
      --canvas: #ffffff;
      --surface: #f4f4f5;
      --paper: var(--canvas);
      --panel: var(--surface);
      --line: #e4e4e7;
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
        --line: #27272a;
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
    .titlebar {
      position: sticky;
      top: 0;
      z-index: 8;
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 3.75rem;
      padding: 8px 16px;
      background: var(--surface);
      border-bottom: 1px solid var(--line);
    }
    .logo-btn {
      width: 36px;
      height: 36px;
      padding: 0;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      border: 0;
      border-radius: 50%;
      background: transparent;
      text-decoration: none;
    }
    .logo-btn:focus-visible,
    .tab-label:focus-visible,
    .titlebar-action:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .titlebar-logo {
      width: 29px;
      height: 29px;
      display: block;
      border-radius: 50%;
    }
    .brand {
      flex: 0 0 auto;
      margin: 0;
      font-weight: 600;
      font-size: 20px;
      line-height: 1.4;
      color: var(--ink);
      white-space: nowrap;
    }
    .chrome-tools {
      display: flex;
      flex: 1 1 auto;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      flex-wrap: wrap;
      margin-left: auto;
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
      padding: 6px 12px;
    }
    .tab-label[aria-pressed="true"] {
      background: var(--primary);
      color: var(--on-primary);
    }
    .titlebar-action {
      display: inline-flex;
      align-items: center;
      height: 36px;
      padding: 0 16px;
      border: 1px solid var(--ink);
      border-radius: 9999px;
      background: transparent;
      color: var(--ink);
      text-decoration: none;
    }
    .titlebar-action-primary {
      background: var(--primary);
      border-color: var(--primary);
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
      margin: 0 0 16px;
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
    .tab-label, .titlebar-action {
      transition: transform 160ms var(--ease-out), background-color 150ms ease, color 150ms ease, border-color 150ms ease;
    }
    .tab-label:active, .titlebar-action:active { transform: scale(0.97); }
    @media (prefers-reduced-motion: reduce) {
      .tab-label, .titlebar-action { transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease; }
      .tab-label:active, .titlebar-action:active { transform: none; }
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
      .lede, .account-card, .stats, .status, .table-wrap {
        animation: enter 200ms var(--ease-out) both;
      }
      .lede { animation-delay: 0ms; }
      .account-card { animation-delay: 40ms; }
      .stats { animation-delay: 80ms; }
      .status { animation-delay: 120ms; }
      .table-wrap { animation-delay: 160ms; }
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
    }
  </style>
</head>
<body>
  <header class="titlebar">
    <a class="logo-btn" href="${input.logoHref}" aria-label="Living Plan">
      <img class="titlebar-logo" src="/favicon.png" alt="" width="29" height="29" />
    </a>
    <h1 class="brand">Dashboard</h1>
    <div class="chrome-tools">
      <div class="tabs" role="group" aria-label="Summary period">
        <button type="button" class="tab-label" data-period="day" aria-pressed="true">Today</button>
        <button type="button" class="tab-label" data-period="week" aria-pressed="false" aria-label="This week">Week</button>
        <button type="button" class="tab-label" data-period="month" aria-pressed="false" aria-label="This month">Month</button>
      </div>
      <div class="tabs" role="group" aria-label="Plan status">
        <button type="button" class="tab-label" data-filter="all" aria-pressed="true">All</button>
        <button type="button" class="tab-label" data-filter="running" aria-pressed="false">Running</button>
        <button type="button" class="tab-label" data-filter="executed" aria-pressed="false">Executed</button>
        <button type="button" class="tab-label" data-filter="interrupted" aria-pressed="false">Interrupted</button>
      </div>
      <button type="button" class="titlebar-action" id="refresh">Refresh</button>
      ${input.toolbarHtml}
    </div>
  </header>
  <main>
    ${input.accountHtml ?? ''}
    <section class="stats" id="stats" aria-live="polite"></section>
    <p class="lede">${input.lede}</p>
    <p class="status" id="status">Loading…</p>
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
  </main>
  <script>
    (() => {
      const apiPath = ${JSON.stringify(input.apiPath)};
      const stats = document.getElementById('stats');
      const status = document.getElementById('status');
      const rows = document.getElementById('rows');
      const periodButtons = Array.from(document.querySelectorAll('[data-period]'));
      const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
      let period = 'day';
      let filter = 'all';
      let latest = null;
      let motion = 'enter';

      const initial = new URLSearchParams(window.location.search).get('period');
      if (initial === 'day' || initial === 'week' || initial === 'month') period = initial;

      function text(tag, className, value) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (value != null) node.textContent = value;
        return node;
      }

      function pathNode(className, value) {
        const node = document.createElement('span');
        node.className = className;
        const parts = String(value).split('/');
        for (let index = 0; index < parts.length; index += 1) {
          if (index > 0) {
            node.append('/');
            node.append(document.createElement('wbr'));
          }
          node.append(parts[index]);
        }
        return node;
      }

      function safeUrl(value) {
        try {
          const url = new URL(value);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
          return url.href;
        } catch (error) {
          return '';
        }
      }

      function formatWhen(ms) {
        if (!ms) return '';
        return new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(ms));
      }

      function formatDuration(ms) {
        const seconds = Math.max(0, Math.round(Number(ms) / 1000));
        if (seconds < 60) return seconds + 's';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + 'm';
        const hours = Math.floor(minutes / 60);
        if (hours < 48) return hours + 'h ' + (minutes % 60) + 'm';
        return Math.floor(hours / 24) + 'd ' + (hours % 24) + 'h';
      }

      function formatRange(summary) {
        const start = formatWhen(summary.from);
        const end = formatWhen(summary.to);
        return start + ' – ' + end;
      }

      const statusLabel = { running: 'Running', executed: 'Executed', interrupted: 'Interrupted' };
      const completionLabel = {
        idle: 'Idle',
        in_progress: 'In progress',
        partial: 'Partial',
        complete: 'Complete',
      };

      function statCard(label, value) {
        const card = text('article', 'stat');
        card.append(text('span', '', label), text('strong', '', value));
        return card;
      }

      function paintStats(summary, animate) {
        stats.replaceChildren(
          statCard('Running', String(summary.running)),
          statCard('Executed', String(summary.executed)),
          statCard('Interrupted', String(summary.interrupted)),
          statCard('Files modified', String(summary.filesModified)),
          statCard('Execution time', formatDuration(summary.durationMs)),
          statCard('Folders', String(summary.folders)),
        );
        if (!animate) return;
        const cards = stats.querySelectorAll('.stat');
        for (let index = 0; index < cards.length; index += 1) {
          cards[index].classList.add('enter');
          cards[index].style.animationDelay = Math.min(index, 6) * 40 + 'ms';
        }
      }

      function planCell(record) {
        const cell = document.createElement('td');
        cell.append(text('span', 'title', record.title || 'Untitled plan'));
        const bits = [record.mode || 'watch'];
        if (record.executionStep) bits.push(record.executionStep);
        if (record.outcome) bits.push(record.outcome);
        cell.append(text('span', 'sub', bits.join(' · ')));
        if (record.planPath) cell.append(pathNode('sub path', record.planPath));
        return cell;
      }

      function completionCell(record) {
        const cell = document.createElement('td');
        const meter = text('div', 'meter');
        const bar = document.createElement('span');
        const ratio = Math.max(0, Math.min(100, Number(record.completionRatio) || 0));
        bar.style.width = ratio + '%';
        meter.append(bar);
        cell.append(meter);
        const state = completionLabel[record.completionState] || 'Idle';
        cell.append(text('span', 'sub', ratio + '% · ' + state));
        const phases = Number(record.phaseDone) + '/' + Number(record.phaseTotal) + ' phases';
        const answers = Number(record.interactionDone) + '/' + Number(record.interactionTotal) + ' answers';
        cell.append(text('span', 'sub', phases + ' · ' + answers));
        return cell;
      }

      function folderCell(record) {
        const cell = document.createElement('td');
        if (record.directory) cell.append(pathNode('path', record.directory));
        const git = record.git || {};
        if (git.branch) cell.append(text('span', 'sub', git.branch + (git.dirty ? ' · dirty' : ' · clean')));
        return cell;
      }

      function actions(record) {
        const cell = document.createElement('td');
        if (record.status === 'running') {
          const site = safeUrl(record.url || '');
          if (site) {
            const open = text('a', 'action', 'Open');
            open.href = site;
            cell.append(open);
          }
        }
        if (record.storedPath && record.id) {
          const archived = text('a', 'action', 'Plan file');
          archived.href = record.fileUrl || ('/archive/' + encodeURIComponent(record.id));
          if (record.storedPath) archived.title = record.storedPath;
          cell.append(archived);
          if (record.historyUrl) {
            const history = text('a', 'action', 'Versions');
            history.href = record.historyUrl;
            cell.append(history);
          }
        }
        return cell;
      }

      function renderRow(record, animate) {
        const row = document.createElement('tr');
        row.append(planCell(record));
        const statusCell = document.createElement('td');
        const pill = text('span', 'pill ' + (record.status || 'running'), statusLabel[record.status] || record.status || 'Running');
        statusCell.append(pill);
        if (typeof record.pendingCount === 'number' && record.status === 'running') {
          statusCell.append(text('span', 'sub', record.pendingCount + ' pending'));
        }
        row.append(statusCell);
        row.append(completionCell(record));
        row.append(folderCell(record));
        row.append(text('td', 'num', String(record.filesModified ?? 0)));
        row.append(text('td', 'num', formatWhen(record.startedAt)));
        row.append(text('td', 'num', formatDuration(record.durationMs)));
        row.append(actions(record));
        return row;
      }

      function visiblePlans(plans) {
        if (filter === 'all') return plans;
        return plans.filter((plan) => plan.status === filter);
      }

      function motionOff() {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      }

      const easeOut = 'cubic-bezier(0.23, 1, 0.32, 1)';

      function slideFrames(kind, shift, phase) {
        if (kind === 'filter') {
          return phase === 'out'
            ? [{ opacity: 1 }, { opacity: 0 }]
            : [{ opacity: 0 }, { opacity: 1 }];
        }
        const outX = shift === 'back' ? '8px' : '-8px';
        const inX = shift === 'back' ? '-8px' : '8px';
        return phase === 'out'
          ? [{ opacity: 1, transform: 'translateX(0px)' }, { opacity: 0, transform: 'translateX(' + outX + ')' }]
          : [{ opacity: 0, transform: 'translateX(' + inX + ')' }, { opacity: 1, transform: 'translateX(0px)' }];
      }

      let paintGeneration = 0;

      function applyPaint(payload, reveal, meters) {
        latest = payload;
        const summary = payload.summary || {};
        const plans = Array.isArray(payload.plans) ? payload.plans : [];
        paintStats(summary, reveal);
        const shown = visiblePlans(plans);
        const range = summary.from ? formatRange(summary) : '';
        const started = typeof summary.started === 'number' ? summary.started : 0;
        status.textContent = (summary.label || 'Period')
          + (range ? ' · ' + range : '')
          + ' · '
          + plans.length
          + (plans.length === 1 ? ' plan active' : ' plans active')
          + ' · '
          + started
          + ' started in this period'
          + (filter === 'all' ? '' : ' · showing ' + shown.length);
        rows.replaceChildren();
        if (shown.length === 0) {
          const row = document.createElement('tr');
          const cell = text('td', 'empty', 'No plans in this view.');
          cell.colSpan = 8;
          if (reveal) row.classList.add('enter');
          row.append(cell);
          rows.append(row);
          return;
        }
        for (let index = 0; index < shown.length; index += 1) {
          const row = renderRow(shown[index], meters);
          if (reveal) {
            row.classList.add('enter');
            row.style.animationDelay = Math.min(index, 8) * 30 + 'ms';
          }
          rows.append(row);
        }
      }

      async function playSwap(kind, shift, update) {
        const generation = paintGeneration;
        const nodes = [status, document.querySelector('.table-wrap')];
        if (kind === 'period') nodes.unshift(stats);
        for (const node of nodes) {
          node.getAnimations().forEach((animation) => animation.cancel());
          node.style.animation = 'none';
          node.style.opacity = '';
        }
        const outgoing = nodes.map((node) => node.animate(slideFrames(kind, shift, 'out'), {
          duration: 160,
          easing: easeOut,
          fill: 'forwards',
        }));
        await Promise.all(outgoing.map((animation) => animation.finished));
        if (generation !== paintGeneration) return;
        for (const node of nodes) node.style.opacity = '0';
        for (const animation of outgoing) animation.cancel();
        update();
        if (generation !== paintGeneration) return;
        nodes.forEach((node) => {
          const animation = node.animate(slideFrames(kind, shift, 'in'), {
            duration: 180,
            easing: easeOut,
            fill: 'both',
          });
          node.style.opacity = '';
          animation.finished.then(() => {
            animation.cancel();
          });
        });
      }

      async function paint(payload) {
        const generation = ++paintGeneration;
        const kind = motion;
        const shift = document.documentElement.dataset.shift === 'back' ? 'back' : 'forward';
        motion = 'quiet';
        const reveal = kind === 'enter' && !motionOff();
        const swap = (kind === 'period' || kind === 'filter') && !motionOff();
        const update = () => {
          if (generation !== paintGeneration) return;
          applyPaint(payload, reveal, reveal || swap);
        };
        if (!swap) {
          update();
          return;
        }
        await playSwap(kind, shift, update);
      }

      function followInternalPage(event) {
        if (motionOff()) return;
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const target = event.target;
        const link = target && target.closest ? target.closest('a[href]') : null;
        if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
        let url;
        try {
          url = new URL(link.href, window.location.href);
        } catch (error) {
          return;
        }
        if (url.origin !== window.location.origin) return;
        if (url.pathname !== '/' && url.pathname !== '/dashboard') return;
        if (url.pathname === window.location.pathname) return;
        event.preventDefault();
        const main = document.querySelector('main');
        const leaving = main.animate(
          [
            { opacity: 1, transform: 'translateY(0px)' },
            { opacity: 0, transform: 'translateY(8px)' },
          ],
          { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' },
        );
        leaving.finished.then(() => {
          window.location.assign(url.href);
        });
      }

      function syncPressed() {
        for (const button of periodButtons) {
          button.setAttribute('aria-pressed', button.getAttribute('data-period') === period ? 'true' : 'false');
        }
        for (const button of filterButtons) {
          button.setAttribute('aria-pressed', button.getAttribute('data-filter') === filter ? 'true' : 'false');
        }
      }

      async function refresh() {
        syncPressed();
        try {
          const response = await fetch(apiPath + '?period=' + encodeURIComponent(period), { cache: 'no-store' });
          if (!response.ok) throw new Error('Request failed');
          await paint(await response.json());
        } catch (error) {
          status.textContent = 'Could not read the dashboard.';
        }
      }

      function periodIndex(value) {
        if (value === 'week') return 1;
        if (value === 'month') return 2;
        return 0;
      }

      for (const button of periodButtons) {
        button.addEventListener('click', () => {
          const nextPeriod = button.getAttribute('data-period') || 'day';
          if (nextPeriod === period) return;
          document.documentElement.dataset.shift = periodIndex(nextPeriod) > periodIndex(period) ? 'forward' : 'back';
          period = nextPeriod;
          motion = 'period';
          const next = new URL(window.location.href);
          next.searchParams.set('period', period);
          history.replaceState(null, '', next);
          refresh();
        });
      }
      for (const button of filterButtons) {
        button.addEventListener('click', () => {
          const nextFilter = button.getAttribute('data-filter') || 'all';
          if (nextFilter === filter) return;
          delete document.documentElement.dataset.shift;
          filter = nextFilter;
          motion = 'filter';
          syncPressed();
          if (latest) paint(latest);
        });
      }
      document.getElementById('refresh').addEventListener('click', () => {
        motion = 'filter';
        refresh();
      });
      document.addEventListener('click', followInternalPage);
      refresh();
      setInterval(refresh, 4000);
    })();
  </script>
  ${input.footScript}
</body>
</html>`
}
