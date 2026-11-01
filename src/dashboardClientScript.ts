/** Browser runtime for the plan dashboard. Loopback and the Start route share it. */
export function dashboardClientScript(apiPath: string): string {
  return `    (() => {
      const apiPath = ${JSON.stringify(apiPath)};
      if (window.__livingPlanDashboardTimer) clearInterval(window.__livingPlanDashboardTimer);
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
        cell.append(text('span', 'sub', bits.join(', ')));
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
        cell.append(text('span', 'sub', ratio + '% ' + state));
        const phases = Number(record.phaseDone) + '/' + Number(record.phaseTotal) + ' phases';
        const answers = Number(record.interactionDone) + '/' + Number(record.interactionTotal) + ' answers';
        cell.append(text('span', 'sub', phases + ', ' + answers));
        return cell;
      }

      function folderCell(record) {
        const cell = document.createElement('td');
        if (record.directory) cell.append(pathNode('path', record.directory));
        const git = record.git || {};
        if (git.branch) cell.append(text('span', 'sub', git.branch + (git.dirty ? ', dirty' : ', clean')));
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
          + (range ? '. ' + range : '')
          + '. '
          + plans.length
          + (plans.length === 1 ? ' plan active' : ' plans active')
          + '. '
          + started
          + ' started in this period'
          + (filter === 'all' ? '' : '. showing ' + shown.length);
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
      window.__livingPlanDashboardTimer = setInterval(refresh, 4000);
    })();`
}
