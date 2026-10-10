/** Styles for the plans switcher embedded in every planner page. */
export const PROCESSES_PANEL_STYLES = `
.processes {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 7;
  width: min(380px, calc(100% - 2rem));
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  pointer-events: none;
}
.processes-toggle,
.processes-panel { pointer-events: auto; }
.processes-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid var(--line);
  background: var(--panel-strong);
  color: var(--ink);
  border-radius: 999px;
  padding: 0.45rem 0.85rem;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--shadow);
  backdrop-filter: blur(14px);
}
.processes-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.processes-count {
  min-width: 1.3rem;
  text-align: center;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--ink);
  font-size: 0.78rem;
  padding: 0.05rem 0.35rem;
}
.processes-panel {
  margin-top: 0.55rem;
  width: 100%;
  max-height: min(70vh, 640px);
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--panel-strong);
  box-shadow: var(--shadow);
  backdrop-filter: blur(16px);
  padding: 0.85rem;
}
.processes-panel[hidden] { display: none !important; }
.processes-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.6rem;
  margin-bottom: 0.35rem;
}
.processes-head strong {
  font-family: var(--font-display);
  font-size: 1.15rem;
}
.processes-registry {
  color: var(--accent);
  font-size: 0.82rem;
  font-weight: 600;
}
.processes-status {
  margin: 0.2rem 0 0.65rem;
  color: var(--muted);
  font-size: 0.88rem;
}
.processes-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}
.process-card {
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.75rem;
  background: var(--surface-soft);
}
.process-card.is-current {
  border-color: var(--accent-border);
  background: var(--accent-soft);
}
.process-title-row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  align-items: baseline;
}
.process-title {
  color: var(--ink);
  font-weight: 600;
  text-decoration: none;
}
a.process-title:hover { color: var(--accent); }
.process-path {
  display: block;
  margin: 0.4rem 0 0.2rem;
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  font-size: 0.75rem;
  line-height: 1.4;
  word-break: break-all;
  color: var(--ink);
}
.process-git,
.process-meta {
  display: block;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.4;
}
.process-paths {
  margin: 0.3rem 0 0;
  padding: 0;
  list-style: none;
  color: var(--muted);
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  font-size: 0.72rem;
}
.process-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.7rem;
}
.process-actions .btn {
  text-decoration: none;
  font-size: 0.85rem;
  padding: 0.4rem 0.75rem;
}
`

export function processesPanelMarkup(): string {
  return `
  <div class="processes" data-processes-root>
    <button type="button" class="processes-toggle" data-processes-toggle aria-expanded="false" aria-controls="processes-panel">
      <span class="live-dot" aria-hidden="true"></span>
      Plans
      <span class="processes-count" data-processes-count>0</span>
    </button>
    <div id="processes-panel" class="processes-panel" data-processes-panel hidden>
      <div class="processes-head">
        <strong>Running plans</strong>
        <a class="processes-registry" data-processes-registry href="" hidden>Registry</a>
      </div>
      <p class="processes-status" data-processes-status>Loading…</p>
      <ul class="processes-list" data-processes-list></ul>
    </div>
  </div>`
}

/** Browser script. Kept free of template placeholders so it can be inlined into the page. */
export function processesPanelScript(): string {
  return `
(() => {
  const root = document.querySelector('[data-processes-root]');
  if (!root) return;
  const toggle = root.querySelector('[data-processes-toggle]');
  const panel = root.querySelector('[data-processes-panel]');
  const count = root.querySelector('[data-processes-count]');
  const status = root.querySelector('[data-processes-status]');
  const list = root.querySelector('[data-processes-list]');
  const registryLink = root.querySelector('[data-processes-registry]');
  if (!toggle || !panel || !count || !status || !list || !registryLink) return;

  let open = false;
  let latest = null;

  function setOpen(next) {
    open = next;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.hidden = !open;
    if (open && latest) paint(latest);
  }

  toggle.addEventListener('click', () => {
    setOpen(!open);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });

  document.addEventListener('click', (event) => {
    if (!open) return;
    if (event.target instanceof Node && root.contains(event.target)) return;
    setOpen(false);
  });

  function safeUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      return url.href;
    } catch (error) {
      return '';
    }
  }

  function age(startedAt) {
    const seconds = Math.max(0, Math.round((Date.now() - Number(startedAt)) / 1000));
    if (seconds < 60) return seconds + 's';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm';
    return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
  }

  function el(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  }

  function paint(payload) {
    latest = payload;
    const processes = Array.isArray(payload.processes) ? payload.processes : [];
    count.textContent = String(processes.length);
    const registryUrl = safeUrl(payload.registryUrl || '');
    if (registryUrl) {
      registryLink.href = registryUrl;
      registryLink.hidden = false;
    } else {
      registryLink.hidden = true;
    }
    if (payload.status === 'disabled') {
      status.textContent = 'Started without the shared registry.';
    } else if (payload.status === 'offline') {
      status.textContent = 'Registry is not responding.';
    } else if (processes.length === 0) {
      status.textContent = 'No plans are running.';
    } else {
      status.textContent = processes.length === 1
        ? '1 plan linked to a directory.'
        : processes.length + ' plans linked to directories.';
    }
    list.replaceChildren();
    if (!open) return;
    for (const record of processes) list.append(renderCard(record, payload.selfId));
  }

  function renderCard(record, selfId) {
    const card = el('li', 'process-card');
    const current = Boolean(selfId) && record.id === selfId;
    if (current) card.classList.add('is-current');

    const titleRow = el('div', 'process-title-row');
    const site = safeUrl(record.url || '');
    const title = document.createElement(site ? 'a' : 'span');
    title.className = 'process-title';
    title.textContent = record.title || 'Untitled plan';
    if (site) {
      title.href = site;
      title.target = '_blank';
      title.rel = 'noopener noreferrer';
    }
    titleRow.append(title);
    titleRow.append(el('span', 'chip', record.mode || 'watch'));
    card.append(titleRow);
    if (current) card.append(el('span', 'process-meta', 'This page'));

    const directory = typeof record.directory === 'string' ? record.directory : '';
    if (directory) card.append(el('code', 'process-path', directory));
    if (record.planPath) card.append(el('span', 'process-meta', record.planPath));

    const git = record.git || {};
    if (git.summary) card.append(el('span', 'process-git', git.summary));
    if (git.root && git.root !== directory) card.append(el('span', 'process-meta', 'Repository ' + git.root));
    if (record.cwd && record.cwd !== directory) card.append(el('span', 'process-meta', 'Launched from ' + record.cwd));

    const paths = Array.isArray(git.changedPaths) ? git.changedPaths.slice(0, 4) : [];
    if (paths.length) {
      const pathList = el('ul', 'process-paths');
      for (const path of paths) pathList.append(el('li', '', path));
      card.append(pathList);
    }

    const bits = [];
    if (record.pid) bits.push('pid ' + record.pid);
    if (record.startedAt) bits.push('up ' + age(record.startedAt));
    if (typeof record.pendingCount === 'number') bits.push(record.pendingCount + ' pending');
    if (record.executionActive) {
      bits.push(record.executionStep ? 'live · ' + record.executionStep : 'execution live');
    }
    if (bits.length) card.append(el('span', 'process-meta', bits.join(' · ')));

    const actions = el('div', 'process-actions');
    if (site) {
      const open = el('a', 'btn primary', current ? 'This site' : 'Open');
      open.href = site;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      actions.append(open);
    }
    if (directory) {
      const copy = el('button', 'btn', 'Copy path');
      copy.type = 'button';
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(directory);
          copy.textContent = 'Copied';
        } catch (error) {
          copy.textContent = 'Copy failed';
        }
        setTimeout(() => {
          copy.textContent = 'Copy path';
        }, 1200);
      });
      actions.append(copy);
    }
    card.append(actions);
    return card;
  }

  async function refresh() {
    try {
      const response = await fetch('/api/processes', { cache: 'no-store' });
      if (!response.ok) throw new Error('Request failed');
      paint(await response.json());
    } catch (error) {
      paint({ status: 'offline', processes: [], selfId: null, registryUrl: null });
    }
  }

  refresh();
  setInterval(refresh, 4000);
})();
`
}
