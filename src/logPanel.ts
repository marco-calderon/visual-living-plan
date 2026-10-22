function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export const LOG_PANEL_STYLES = `
.log-panel { display: grid; gap: 0.75rem; }
.log-panel h2 {
  font-family: Fraunces, "Iowan Old Style", Georgia, serif;
  font-size: 1.45rem;
  margin: 0;
}
.log-panel .log-copy { margin: 0; color: var(--muted); line-height: 1.5; max-width: 42rem; }
.log-filters { display: flex; gap: 0.35rem; flex-wrap: wrap; }
.log-filters button {
  font: inherit;
  border: 1px solid var(--line);
  background: var(--panel, transparent);
  color: var(--ink);
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
}
.log-filters button[aria-pressed="true"] {
  background: var(--accent, #0f766e);
  border-color: var(--accent, #0f766e);
  color: var(--on-accent, #f4fffc);
}
.log-status { margin: 0; color: var(--muted); font-size: 0.92rem; }
.log-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
.log-empty { color: var(--muted); padding: 0.2rem 0; }
.log-item {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 0.7rem 0.85rem;
  background: var(--panel, transparent);
}
.log-item.level-error {
  border-color: var(--danger-border, rgba(180, 35, 24, 0.28));
  background: var(--danger-soft, rgba(180, 35, 24, 0.08));
}
.log-item.level-warn {
  border-color: rgba(146, 64, 14, 0.28);
  background: rgba(146, 64, 14, 0.08);
}
.log-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 0.7rem;
  align-items: baseline;
  color: var(--muted);
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  font-size: 0.75rem;
}
.log-level { font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.log-item.level-error .log-level { color: var(--danger, #b42318); }
.log-item.level-warn .log-level { color: #92400e; }
.log-message { margin: 0.35rem 0 0; white-space: pre-wrap; word-break: break-word; }
.log-detail {
  margin: 0.45rem 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  font-size: 0.78rem;
  color: var(--muted);
}
.log-count {
  display: inline-block;
  margin-left: 0.35rem;
  min-width: 1.15rem;
  padding: 0.05rem 0.38rem;
  border-radius: 999px;
  background: var(--danger, #b42318);
  color: #fff;
  font-size: 0.72rem;
  line-height: 1.3;
  text-align: center;
}
.log-count[hidden] { display: none !important; }
@media (prefers-color-scheme: dark) {
  .log-item.level-warn { border-color: rgba(253, 186, 116, 0.35); background: rgba(253, 186, 116, 0.1); }
  .log-item.level-warn .log-level { color: #fdba74; }
}
`

/** The Logs panel. `endpoint` is this page's `GET` and `POST /api/logs`. */
export function logPanelMarkup(endpoint: string, options?: { showPlan?: boolean }): string {
  const plan = options?.showPlan ? ' data-log-show-plan="true"' : ''
  return `
    <section class="log-panel" data-log-panel data-log-endpoint="${escapeHtml(endpoint)}"${plan}>
      <div>
        <h2>Errors, warnings, and logs</h2>
        <p class="log-copy">Messages from this page and the plan service that the rest of the interface does not show. They stay in this process until it restarts. <code>live-plan logs</code> prints the same list.</p>
      </div>
      <div class="log-filters" role="group" aria-label="Log level">
        <button type="button" data-log-level="all" aria-pressed="true">All</button>
        <button type="button" data-log-level="error" aria-pressed="false">Errors</button>
        <button type="button" data-log-level="warn" aria-pressed="false">Warnings</button>
        <button type="button" data-log-level="log" aria-pressed="false">Logs</button>
      </div>
      <p class="log-status" data-log-status>Waiting for logs.</p>
      <ol class="log-list" data-log-list></ol>
    </section>
  `
}

/** Capture console and window failures, and paint the logs panel. */
export function logPanelScript(): string {
  return `(() => {
  if (window.__livingPlanLogsInstalled) return;
  window.__livingPlanLogsInstalled = true;
  const panel = document.querySelector('[data-log-panel]');
  if (!panel) return;
  const endpoint = panel.getAttribute('data-log-endpoint') || '/api/logs';
  const list = panel.querySelector('[data-log-list]');
  const status = panel.querySelector('[data-log-status]');
  const showPlan = panel.hasAttribute('data-log-show-plan');
  let entries = [];
  let filter = 'all';
  const recent = new Map();

  function formatArg(value) {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message || value.name;
    try { return JSON.stringify(value); } catch { return String(value); }
  }

  function formatWhen(ms) {
    try {
      return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(ms));
    } catch {
      return '';
    }
  }

  function paint() {
    if (!list || !status) return;
    const rows = entries.filter((entry) => filter === 'all' || entry.level === filter);
    list.replaceChildren();
    if (rows.length === 0) {
      const item = document.createElement('li');
      item.className = 'log-empty';
      item.textContent = filter === 'all' ? 'No errors, warnings, or logs yet.' : 'Nothing at this level.';
      list.append(item);
    } else {
      for (const entry of rows) list.append(renderEntry(entry));
    }
    const notable = entries.filter((entry) => entry.level === 'error' || entry.level === 'warn').length;
    status.textContent = entries.length === 0
      ? 'Waiting for logs.'
      : entries.length + (entries.length === 1 ? ' message.' : ' messages.') + (notable ? ' ' + notable + ' need a look.' : '');
    document.querySelectorAll('[data-log-count]').forEach((node) => {
      if (!notable) {
        node.hidden = true;
        node.textContent = '';
        return;
      }
      node.hidden = false;
      node.textContent = String(notable);
    });
  }

  function renderEntry(entry) {
    const item = document.createElement('li');
    item.className = 'log-item level-' + (entry.level || 'log');
    const meta = document.createElement('div');
    meta.className = 'log-meta';
    const level = document.createElement('span');
    level.className = 'log-level';
    level.textContent = entry.level || 'log';
    meta.append(level);
    const when = document.createElement('time');
    when.dateTime = new Date(entry.at || Date.now()).toISOString();
    when.textContent = formatWhen(entry.at);
    meta.append(when);
    if (entry.source) {
      const source = document.createElement('span');
      source.textContent = entry.source;
      meta.append(source);
    }
    if (showPlan && entry.planId) {
      const plan = document.createElement('span');
      plan.textContent = entry.planId;
      meta.append(plan);
    }
    if (entry.repeat > 1) {
      const repeat = document.createElement('span');
      repeat.textContent = '×' + entry.repeat;
      meta.append(repeat);
    }
    item.append(meta);
    const message = document.createElement('p');
    message.className = 'log-message';
    message.textContent = entry.message || '';
    item.append(message);
    if (entry.detail) {
      const detail = document.createElement('pre');
      detail.className = 'log-detail';
      detail.textContent = entry.detail;
      item.append(detail);
    }
    return item;
  }

  function upsert(entry) {
    if (!entry || !entry.id) return;
    const index = entries.findIndex((row) => row.id === entry.id);
    if (index === -1) entries.push(entry);
    else entries[index] = entry;
    entries.sort((a, b) => (b.at || 0) - (a.at || 0));
    if (entries.length > 500) entries.length = 500;
    paint();
  }

  function merge(logs) {
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    for (const entry of logs) byId.set(entry.id, entry);
    entries = Array.from(byId.values()).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 500);
    paint();
  }

  async function pull() {
    try {
      const response = await fetch(endpoint + (endpoint.includes('?') ? '&' : '?') + 'limit=200', { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not read logs');
      const payload = await response.json();
      entries = entries.filter((entry) => entry.id !== 'local-unread');
      merge(Array.isArray(payload.logs) ? payload.logs : []);
    } catch {
      if (!entries.some((entry) => entry.id === 'local-unread')) {
        upsert({ id: 'local-unread', level: 'warn', message: 'Could not read logs from the plan service.', source: 'page', at: Date.now(), repeat: 1 });
      }
    }
  }

  function send(level, message, detail, source) {
    const text = String(message || '').trim();
    if (!text) return;
    const key = level + '\\n' + text;
    const now = Date.now();
    const last = recent.get(key) || 0;
    if (now - last < 5000) return;
    recent.set(key, now);
    fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        level: level,
        message: text.slice(0, 2000),
        detail: detail ? String(detail).slice(0, 8000) : undefined,
        source: source === 'page' ? 'page' : 'browser',
      }),
    }).then((response) => response.ok ? response.json() : null).then((body) => {
      if (body && body.log) upsert(body.log);
    }).catch(() => {});
  }

  window.__livingPlanReport = (level, message, detail, source) => {
    send(level, message, detail, source || 'page');
  };
  window.__livingPlanRefreshLogs = () => { void pull(); };

  ['error', 'warn', 'log'].forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      const detail = args.filter((value) => value instanceof Error && value.stack).map((value) => value.stack).join('\\n');
      send(level, args.map(formatArg).join(' '), detail, 'browser');
    };
  });

  window.addEventListener('error', (event) => {
    const detail = event.error && event.error.stack ? event.error.stack : '';
    const where = event.filename ? event.filename + ':' + event.lineno : '';
    send('error', event.message || (where ? 'Resource failed to load' : 'Script error'), [detail, where].filter(Boolean).join('\\n'), 'browser');
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? (reason.message || reason.name) : String(reason);
    const detail = reason instanceof Error ? reason.stack : '';
    send('error', message || 'Unhandled rejection', detail, 'browser');
  });

  panel.querySelectorAll('[data-log-level]').forEach((button) => {
    button.addEventListener('click', () => {
      filter = button.getAttribute('data-log-level') || 'all';
      panel.querySelectorAll('[data-log-level]').forEach((node) => {
        node.setAttribute('aria-pressed', node === button ? 'true' : 'false');
      });
      paint();
    });
  });

  void pull();
  window.setInterval(() => {
    if (!document.hidden) void pull();
  }, 2000);
})();`
}
