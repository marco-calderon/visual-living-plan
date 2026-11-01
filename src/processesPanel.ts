/** Styles for the plans switcher embedded in every planner page. */
export const PROCESSES_PANEL_STYLES = `
.processes {
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
  align-self: stretch;
  width: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
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
  padding: 8px 12px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
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
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.55rem;
  width: min(380px, calc(100vw - 2rem));
  max-height: min(70vh, 640px);
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--panel-strong);
  box-shadow: var(--shadow);
  padding: 0.85rem;
  transform-origin: top right;
  opacity: 0;
  transform: scale(0.95);
  transition:
    opacity 200ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    transform 200ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
}
.processes-panel[hidden] { display: none !important; }
.processes-panel[data-open] {
  opacity: 1;
  transform: scale(1);
}
.processes-panel[data-closed] {
  opacity: 0;
  transform: scale(0.95);
}
@media (prefers-reduced-motion: reduce) {
  .processes-panel,
  .processes-panel[data-open],
  .processes-panel[data-closed] {
    transform: none;
    transition: opacity 150ms var(--ease-out, cubic-bezier(0.23, 1, 0.32, 1));
  }
}
.processes-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.6rem;
  margin-bottom: 0.35rem;
}
.processes-head strong {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.15rem;
}
.processes-links { display: flex; gap: 0.7rem; }
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
  grid-template-columns: minmax(0, 1fr);
  gap: 0.55rem;
}
.process-card {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0.75rem;
  background: var(--surface-soft);
}
.process-card.is-current {
  border-color: var(--accent-border);
  background: var(--accent-soft);
}
.process-card.is-current .process-mode,
.process-card.is-current .process-pill:not(.is-pending),
.process-card.is-current .process-icon-btn {
  background: var(--panel-strong);
}
.process-title-row {
  display: flex;
  justify-content: space-between;
  gap: 0.55rem;
  align-items: flex-start;
  min-width: 0;
}
.process-title {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--ink);
  font-weight: 600;
  text-decoration: none;
}
a.process-title:hover { color: var(--accent); }
.process-mode {
  display: inline-grid;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  flex: 0 0 auto;
  margin-top: 0.05rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--chip-bg);
  color: var(--muted);
}
.process-mode[data-mode="review"] {
  color: var(--accent);
  background: var(--accent-soft);
  border-color: var(--accent-border);
}
.process-mode[data-mode="comment"] {
  color: var(--accent-2);
  background: var(--wash-warm);
  border-color: var(--line);
}
.process-mode svg,
.process-icon-btn svg,
.process-folder-icon svg,
.process-git-icon svg {
  width: 14px;
  height: 14px;
  display: block;
  pointer-events: none;
}
.process-path-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.45rem;
  min-width: 0;
}
.process-folder-icon,
.process-git-icon {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  color: var(--muted);
}
.process-path {
  flex: 0 1 auto;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--ink);
}
.process-icon-btn {
  display: inline-grid;
  place-items: center;
  width: 1.7rem;
  height: 1.7rem;
  padding: 0;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--control-bg);
  color: var(--ink);
  cursor: pointer;
  text-decoration: none;
  flex: 0 0 auto;
}
.process-icon-btn:hover {
  border-color: var(--accent-hover-border);
  background: var(--accent-soft);
  color: var(--accent);
}
.process-icon-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.process-icon-btn.is-copied {
  color: var(--ok);
  border-color: var(--ok);
}
.process-icon-btn.is-failed {
  color: var(--danger);
  border-color: var(--danger-border);
}
.process-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.45rem;
}
.process-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--chip-bg);
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.2;
  padding: 0.12rem 0.48rem;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.process-pill svg {
  width: 12px;
  height: 12px;
  display: block;
  flex: 0 0 auto;
  pointer-events: none;
}
.process-pill.is-pending {
  color: var(--accent-2);
  background: var(--wash-warm);
  border-color: var(--accent-2);
}
.process-git-row {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  margin-top: 0.4rem;
  min-width: 0;
  color: var(--muted);
}
.process-git-icon { margin-top: 0.12rem; }
.process-git,
.process-meta {
  display: block;
  margin-top: 0.35rem;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.4;
}
.process-git-row .process-git {
  margin-top: 0;
  min-width: 0;
}
.process-paths {
  margin: 0.3rem 0 0;
  padding: 0;
  list-style: none;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
}
`

/** Last segment of the directory a plan is linked to. */
export function containerFolderName(directory: string): string {
  const trimmed = directory.replace(/[\\/]+$/, '')
  if (!trimmed) return directory
  const slash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  const name = slash === -1 ? trimmed : trimmed.slice(slash + 1)
  return name || directory
}

export function processesPanelMarkup(selfId?: string): string {
  const self = selfId ? ` data-self-id="${selfId.replaceAll('"', '')}"` : ''
  return `
  <div class="processes" data-processes-root${self}>
    <button type="button" class="processes-toggle" data-processes-toggle aria-expanded="false" aria-controls="processes-panel">
      <span class="live-dot" aria-hidden="true"></span>
      Plans
      <span class="processes-count" data-processes-count>0</span>
    </button>
    <div id="processes-panel" class="processes-panel" data-processes-panel hidden>
      <div class="processes-head">
        <strong>Running plans</strong>
        <span class="processes-links">
          <a class="processes-registry" data-processes-dashboard href="" hidden>Dashboard</a>
          <a class="processes-registry" data-processes-registry href="" hidden>Registry</a>
        </span>
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
  setTimeout(() => {
  if (document.documentElement.dataset.planChrome === 'react') return;
  const root = document.querySelector('[data-processes-root]');
  if (!root) return;
  const toggle = root.querySelector('[data-processes-toggle]');
  const panel = root.querySelector('[data-processes-panel]');
  const count = root.querySelector('[data-processes-count]');
  const status = root.querySelector('[data-processes-status]');
  const list = root.querySelector('[data-processes-list]');
  const registryLink = root.querySelector('[data-processes-registry]');
  const dashboardLink = root.querySelector('[data-processes-dashboard]');
  const pageSelfId = root.getAttribute('data-self-id');
  if (!toggle || !panel || !count || !status || !list || !registryLink || !dashboardLink) return;

  let open = false;
  let latest = null;
  let closeTimer = 0;
  let closeListener = null;

  function containerFolderName(directory) {
    const trimmed = directory.replace(/[\\\\/]+$/, '');
    if (!trimmed) return directory;
    const slash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\\\'));
    const name = slash === -1 ? trimmed : trimmed.slice(slash + 1);
    return name || directory;
  }

  function cancelClose() {
    window.clearTimeout(closeTimer);
    closeTimer = 0;
    if (closeListener) {
      panel.removeEventListener('transitionend', closeListener);
      closeListener = null;
    }
  }

  function finishClose() {
    cancelClose();
    if (open) return;
    panel.hidden = true;
  }

  function setOpen(next) {
    if (next === open) return;
    open = next;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    cancelClose();
    if (open) {
      panel.hidden = false;
      panel.removeAttribute('data-closed');
      panel.removeAttribute('data-open');
      void panel.getBoundingClientRect();
      panel.setAttribute('data-open', '');
      if (latest) paint(latest);
      return;
    }
    panel.removeAttribute('data-open');
    panel.setAttribute('data-closed', '');
    closeListener = (event) => {
      if (event.target !== panel || event.propertyName !== 'opacity') return;
      finishClose();
    };
    panel.addEventListener('transitionend', closeListener);
    closeTimer = window.setTimeout(finishClose, 280);
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
    if (!value) return '';
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

  function lucide(body) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }

  const ICON_WATCH = lucide('<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>');
  const ICON_REVIEW = lucide('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>');
  const ICON_COMMENT = lucide('<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>');
  const ICON_COPY = lucide('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>');
  const ICON_CHECK = lucide('<path d="M20 6 9 17l-5-5"/>');
  const ICON_CLOCK = lucide('<path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="10"/>');
  const ICON_FOLDER = lucide('<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>');
  const ICON_BRANCH = lucide('<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>');

  function modeStatus(mode) {
    if (mode === 'review') return { id: 'review', label: 'Review', icon: ICON_REVIEW };
    if (mode === 'comment') return { id: 'comment', label: 'Comment', icon: ICON_COMMENT };
    return { id: 'watch', label: 'Watch', icon: ICON_WATCH };
  }

  function paint(payload) {
    latest = payload;
    const processes = Array.isArray(payload.processes) ? payload.processes : [];
    count.textContent = String(processes.length);
    const registryUrl = safeUrl(payload.registryUrl || '');
    if (registryUrl) {
      registryLink.href = registryUrl;
      registryLink.hidden = false;
      dashboardLink.href = new URL('/dashboard', registryUrl).href;
      dashboardLink.hidden = false;
    } else {
      registryLink.hidden = true;
      dashboardLink.hidden = true;
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
    if (!open) return;
    list.replaceChildren();
    for (const record of processes) list.append(renderCard(record, payload.selfId || pageSelfId));
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
    const mode = modeStatus(record.mode);
    const modeMark = el('span', 'process-mode');
    modeMark.dataset.mode = mode.id;
    modeMark.setAttribute('role', 'img');
    modeMark.setAttribute('aria-label', mode.label);
    modeMark.title = mode.label;
    modeMark.innerHTML = mode.icon;
    titleRow.append(title, modeMark);
    card.append(titleRow);
    if (current) card.append(el('span', 'process-meta', 'This page'));

    const directory = typeof record.directory === 'string' ? record.directory : '';
    if (directory) {
      const pathRow = el('div', 'process-path-row');
      const folderIcon = el('span', 'process-folder-icon');
      folderIcon.innerHTML = ICON_FOLDER;
      const folder = el('code', 'process-path', containerFolderName(directory));
      folder.title = directory;
      const copy = el('button', 'process-icon-btn');
      copy.type = 'button';
      copy.setAttribute('aria-label', 'Copy path');
      copy.title = 'Copy path';
      copy.innerHTML = ICON_COPY;
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(directory);
          copy.innerHTML = ICON_CHECK;
          copy.classList.add('is-copied');
          copy.classList.remove('is-failed');
          copy.setAttribute('aria-label', 'Copied');
          copy.title = 'Copied';
        } catch (error) {
          copy.classList.add('is-failed');
          copy.classList.remove('is-copied');
          copy.setAttribute('aria-label', 'Copy failed');
          copy.title = 'Copy failed';
        }
        window.setTimeout(() => {
          if (!copy.isConnected) return;
          copy.innerHTML = ICON_COPY;
          copy.classList.remove('is-copied', 'is-failed');
          copy.setAttribute('aria-label', 'Copy path');
          copy.title = 'Copy path';
        }, 1200);
      });
      pathRow.append(folderIcon, folder, copy);
      card.append(pathRow);
    }

    const git = record.git || {};
    const paths = Array.isArray(git.changedPaths) ? git.changedPaths.slice(0, 4) : [];
    if (git.summary || paths.length) {
      const gitRow = el('div', 'process-git-row');
      const branch = el('span', 'process-git-icon');
      branch.innerHTML = ICON_BRANCH;
      gitRow.append(branch);
      if (git.summary) gitRow.append(el('span', 'process-git', git.summary));
      card.append(gitRow);
    }
    if (paths.length) {
      const pathList = el('ul', 'process-paths');
      for (const path of paths) pathList.append(el('li', '', path));
      card.append(pathList);
    }

    const pills = el('div', 'process-pills');
    if (record.startedAt) {
      const uptime = el('span', 'process-pill');
      uptime.title = 'Uptime';
      uptime.innerHTML = ICON_CLOCK;
      uptime.append(document.createTextNode(age(record.startedAt)));
      pills.append(uptime);
    }
    if (typeof record.pendingCount === 'number' && record.pendingCount > 0) {
      pills.append(el('span', 'process-pill is-pending', record.pendingCount + ' pending'));
    }
    if (pills.childElementCount) card.append(pills);

    if (record.executionActive) {
      card.append(el('span', 'process-meta', record.executionStep ? 'live · ' + record.executionStep : 'execution live'));
    }
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
  }, 0);
})();
`
}
