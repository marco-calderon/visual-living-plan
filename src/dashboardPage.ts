/** Control dashboard for plans that are running and plans that have finished. */
export function renderDashboardPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Plan dashboard · Living Plan</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560;9..144,680&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    :root {
      color-scheme: light;
      --ink: #14211c;
      --muted: #4d6158;
      --paper: #f3f6f3;
      --panel: rgba(255, 255, 255, 0.92);
      --line: rgba(20, 33, 28, 0.12);
      --accent: #0f766e;
      --accent-soft: rgba(15, 118, 110, 0.12);
      --good: #166534;
      --good-soft: rgba(22, 101, 52, 0.12);
      --warn: #92400e;
      --warn-soft: rgba(146, 64, 14, 0.12);
      --shadow: 0 18px 40px rgba(20, 33, 28, 0.08);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        color-scheme: dark;
        --ink: #e8f3ee;
        --muted: #b7c7c0;
        --paper: #101816;
        --panel: rgba(22, 36, 32, 0.92);
        --line: rgba(232, 243, 238, 0.14);
        --accent: #2dd4bf;
        --accent-soft: rgba(45, 212, 191, 0.14);
        --good: #86efac;
        --good-soft: rgba(134, 239, 172, 0.12);
        --warn: #fdba74;
        --warn-soft: rgba(253, 186, 116, 0.12);
        --shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
      }
    }
    * { box-sizing: border-box; }
    @view-transition { navigation: auto; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: "IBM Plex Sans", sans-serif;
      background:
        radial-gradient(900px 420px at 100% -10%, rgba(15, 118, 110, 0.16), transparent 46%),
        var(--paper);
    }
    main { width: min(1180px, calc(100% - 2rem)); margin: 0 auto; padding: 2.2rem 0 4rem; }
    .top {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: flex-end;
      flex-wrap: wrap;
    }
    .kicker {
      margin: 0 0 0.35rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--accent);
    }
    h1 {
      font-family: Fraunces, serif;
      font-size: clamp(2.1rem, 4vw, 3.2rem);
      line-height: 0.95;
      margin: 0;
    }
    .lede { margin: 0.7rem 0 0; color: var(--muted); max-width: 40rem; line-height: 1.5; }
    .nav { display: flex; gap: 0.5rem; align-items: center; }
    a.link {
      color: var(--accent);
      font-weight: 600;
      text-decoration: none;
    }
    a.link:hover { text-decoration: underline; }
    .toolbar {
      display: flex;
      justify-content: space-between;
      gap: 0.8rem;
      align-items: center;
      flex-wrap: wrap;
      margin: 1.4rem 0 0.9rem;
    }
    .segment, .filters { display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .filters { margin: 0 0 1.35rem; padding-bottom: 0.15rem; }
    button.seg, button.filter, button.refresh {
      font: inherit;
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--ink);
      border-radius: 999px;
      padding: 0.4rem 0.8rem;
      cursor: pointer;
    }
    button.seg[aria-pressed="true"], button.filter[aria-pressed="true"] {
      background: var(--accent);
      border-color: var(--accent);
      color: #f4fffc;
    }
    button.refresh { font-weight: 600; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 0.7rem;
      margin: 0 0 0.8rem;
    }
    .stat {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 0.85rem 0.95rem;
      box-shadow: var(--shadow);
    }
    .stat span { display: block; color: var(--muted); font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase; }
    .stat strong {
      display: block;
      margin-top: 0.25rem;
      font-family: Fraunces, serif;
      font-size: 1.7rem;
      font-variant-numeric: tabular-nums;
    }
    .status { color: var(--muted); margin: 0 0 0.8rem; }
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
      padding: 0.85rem 1rem 0;
      font-family: Fraunces, serif;
      font-size: 1.25rem;
    }
    th, td {
      text-align: left;
      padding: 0.75rem 0.9rem;
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
      font-family: "IBM Plex Mono", ui-monospace, monospace;
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
    @media (prefers-reduced-motion: no-preference) {
      @keyframes enter {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: none; }
      }
      @keyframes enter-forward {
        from { opacity: 0; transform: translateX(18px); }
        to { opacity: 1; transform: none; }
      }
      @keyframes enter-back {
        from { opacity: 0; transform: translateX(-18px); }
        to { opacity: 1; transform: none; }
      }
      @keyframes fade-out {
        to { opacity: 0; }
      }
      @keyframes row-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      ::view-transition-old(root) { animation: 180ms ease both fade-out; }
      ::view-transition-new(root) { animation: 320ms cubic-bezier(0.2, 0.7, 0.2, 1) both enter; }
      .top, .toolbar, .stats, .status, .filters, .table-wrap {
        animation: enter 0.55s cubic-bezier(0.2, 0.7, 0.2, 1) both;
      }
      .top { animation-delay: 0.02s; }
      .toolbar { animation-delay: 0.08s; }
      .stats { animation-delay: 0.14s; }
      .status { animation-delay: 0.2s; }
      .filters { animation-delay: 0.26s; }
      .table-wrap { animation-delay: 0.32s; }
      .stat.enter, .table-wrap.swap, .stats.swap, .status.swap {
        animation: enter 0.38s cubic-bezier(0.2, 0.7, 0.2, 1) both;
      }
      html[data-shift="forward"] .table-wrap.swap,
      html[data-shift="forward"] .stats.swap,
      html[data-shift="forward"] .status.swap { animation-name: enter-forward; }
      html[data-shift="back"] .table-wrap.swap,
      html[data-shift="back"] .stats.swap,
      html[data-shift="back"] .status.swap { animation-name: enter-back; }
      tbody tr.enter { animation: row-in 0.35s ease both; }
      button.seg, button.filter {
        transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
      }
      .meter span { transition: width 0.45s ease; }
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
  </style>
</head>
<body>
  <main>
    <div class="top">
      <div>
        <p class="kicker">Living Plan</p>
        <h1>Control dashboard</h1>
        <p class="lede">Running plans and plans that have already executed. Summaries follow the local day, week, and month. Files modified is the largest git change set seen during the run. Each plan file is kept in the registry's plans folder.</p>
      </div>
      <p class="nav"><a class="link" href="/">Running plans</a></p>
    </div>
    <div class="toolbar">
      <div class="segment" role="group" aria-label="Summary period">
        <button type="button" class="seg" data-period="day" aria-pressed="true">Today</button>
        <button type="button" class="seg" data-period="week" aria-pressed="false">This week</button>
        <button type="button" class="seg" data-period="month" aria-pressed="false">This month</button>
      </div>
      <button type="button" class="refresh" id="refresh">Refresh</button>
    </div>
    <section class="stats" id="stats" aria-live="polite"></section>
    <p class="status" id="status">Loading…</p>
    <div class="filters" role="group" aria-label="Plan status">
      <button type="button" class="filter" data-filter="all" aria-pressed="true">All</button>
      <button type="button" class="filter" data-filter="running" aria-pressed="false">Running</button>
      <button type="button" class="filter" data-filter="executed" aria-pressed="false">Executed</button>
      <button type="button" class="filter" data-filter="interrupted" aria-pressed="false">Interrupted</button>
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
  </main>
  <script>
    (() => {
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

      function replay(node) {
        node.classList.remove('swap');
        void node.offsetWidth;
        node.classList.add('swap');
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
          cards[index].style.animationDelay = (index * 45) + 'ms';
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

      function completionCell(record, animate) {
        const cell = document.createElement('td');
        const meter = text('div', 'meter');
        const bar = document.createElement('span');
        const ratio = Math.max(0, Math.min(100, Number(record.completionRatio) || 0));
        bar.style.width = animate ? '0%' : ratio + '%';
        if (animate) {
          requestAnimationFrame(() => {
            bar.style.width = ratio + '%';
          });
        }
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
          archived.href = '/plans/' + encodeURIComponent(record.id);
          if (record.storedPath) archived.title = record.storedPath;
          cell.append(archived);
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
        row.append(completionCell(record, animate));
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

      function paint(payload) {
        latest = payload;
        const summary = payload.summary || {};
        const plans = Array.isArray(payload.plans) ? payload.plans : [];
        const animate = motion !== 'quiet';
        const animateStats = motion === 'enter' || motion === 'period';
        if (motion === 'period' || motion === 'filter') {
          replay(document.querySelector('.table-wrap'));
          if (motion === 'period') {
            replay(stats);
            replay(status);
          }
        }
        paintStats(summary, animateStats);
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
          if (animate) row.classList.add('enter');
          row.append(cell);
          rows.append(row);
          motion = 'quiet';
          return;
        }
        for (let index = 0; index < shown.length; index += 1) {
          const row = renderRow(shown[index], animate);
          if (animate) {
            row.classList.add('enter');
            row.style.animationDelay = Math.min(index, 12) * 40 + 'ms';
          }
          rows.append(row);
        }
        motion = 'quiet';
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
          const response = await fetch('/api/dashboard?period=' + encodeURIComponent(period), { cache: 'no-store' });
          if (!response.ok) throw new Error('Request failed');
          paint(await response.json());
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
      document.getElementById('refresh').addEventListener('click', refresh);
      refresh();
      setInterval(refresh, 4000);
    })();
  </script>
</body>
</html>`
}
