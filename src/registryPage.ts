import { faviconLink } from './favicon'

/** Index of every plan the registry knows about. Each card opens that plan's site. */
export function renderRegistryPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${faviconLink}
  <title>Running plans · Living Plan</title>
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
      --shadow: none;
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
    main { width: min(760px, calc(100% - 2rem)); margin: 0 auto; padding: 2.5rem 0 4rem; }
    .kicker { margin: 0 0 0.4rem; letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.75rem; font-weight: 600; color: var(--accent); }
    h1 { font-family: "DM Sans", Inter, "Helvetica Neue", Helvetica, Arial, sans-serif; font-weight: 600; font-size: 32px; line-height: 1.25; letter-spacing: -0.5px; margin: 0 0 0.7rem; color: var(--ink); }
    .lede { margin: 0 0 1rem; color: var(--muted); max-width: 38rem; line-height: 1.5; }
    .lede a { color: var(--accent); font-weight: 600; }
    .status { color: var(--muted); margin: 0 0 0.8rem; }
    ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.7rem; }
    article {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 0.95rem 1rem;
      box-shadow: var(--shadow);
    }
    .title-row { display: flex; justify-content: space-between; gap: 0.6rem; align-items: baseline; }
    h2 { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.4; font-family: "DM Sans", Inter, "Helvetica Neue", Helvetica, Arial, sans-serif; color: var(--ink); }
    h2 a { color: inherit; text-decoration: none; }
    h2 a:hover { color: var(--accent); }
    .mode { color: var(--muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; }
    .path { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.78rem; word-break: break-all; margin: 0.45rem 0; }
    .meta { color: var(--muted); font-size: 0.88rem; line-height: 1.45; margin: 0.15rem 0; }
    .actions { display: flex; gap: 0.45rem; margin-top: 0.75rem; }
    a.btn {
      display: inline-flex;
      text-decoration: none;
      border-radius: 999px;
      padding: 0.45rem 0.8rem;
      background: var(--primary);
      color: var(--on-primary);
      font-weight: 600;
      font-size: 0.88rem;
    }
    @media (prefers-reduced-motion: no-preference) {
      @keyframes enter {
        from { opacity: 0; transform: translateY(16px); }
        to { opacity: 1; transform: none; }
      }
      .kicker, h1, .lede, .actions, .status, #list {
        animation: enter 0.7s cubic-bezier(0.16, 0.84, 0.24, 1) both;
      }
      .kicker { animation-delay: 0.02s; }
      h1 { animation-delay: 0.08s; }
      .lede { animation-delay: 0.14s; }
      .actions { animation-delay: 0.22s; }
      .status { animation-delay: 0.3s; }
      #list { animation-delay: 0.38s; }
      article.enter { animation: enter 0.55s cubic-bezier(0.16, 0.84, 0.24, 1) both; }
    }
  </style>
</head>
<body>
  <main>
    <p class="kicker">Living Plan</p>
    <h1>Running plans</h1>
    <p class="lede">Plans started from the CLI. Each one is linked to a directory and that directory's git status. Open an entry to work in its site. Finished runs stay on the <a href="/dashboard">dashboard</a>.</p>
    <p class="actions"><a class="btn" href="/dashboard">Dashboard</a></p>
    <p class="status" id="status">Loading…</p>
    <ul id="list"></ul>
  </main>
  <script>
    (() => {
      const status = document.getElementById('status');
      const list = document.getElementById('list');
      let revealed = false;

      function text(tag, className, value) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        node.textContent = value;
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

      function age(startedAt) {
        const seconds = Math.max(0, Math.round((Date.now() - Number(startedAt)) / 1000));
        if (seconds < 60) return seconds + 's';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + 'm';
        return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
      }

      function render(processes) {
        list.replaceChildren();
        if (processes.length === 0) {
          status.textContent = 'No plans are running.';
          return;
        }
        status.textContent = processes.length === 1
          ? '1 plan linked to a directory.'
          : processes.length + ' plans linked to directories.';
        for (const record of processes) {
          const card = document.createElement('article');
          const titleRow = document.createElement('div');
          titleRow.className = 'title-row';
          const heading = document.createElement('h2');
          const site = safeUrl(record.url);
          if (site) {
            const link = document.createElement('a');
            link.href = site;
            link.textContent = record.title || 'Untitled plan';
            heading.append(link);
          } else {
            heading.textContent = record.title || 'Untitled plan';
          }
          titleRow.append(heading, text('span', 'mode', record.mode || 'watch'));
          card.append(titleRow);
          if (record.directory) card.append(text('p', 'path', record.directory));
          if (record.planPath) card.append(text('p', 'meta', record.planPath));
          const git = record.git || {};
          if (git.summary) card.append(text('p', 'meta', git.summary));
          if (git.root && git.root !== record.directory) card.append(text('p', 'meta', 'Repository ' + git.root));
          const paths = Array.isArray(git.changedPaths) ? git.changedPaths.slice(0, 4) : [];
          if (paths.length) card.append(text('p', 'meta', paths.join(' · ')));
          const bits = [];
          if (record.pid) bits.push('pid ' + record.pid);
          if (record.startedAt) bits.push('up ' + age(record.startedAt));
          if (typeof record.pendingCount === 'number') bits.push(record.pendingCount + ' pending');
          if (record.executionActive) bits.push(record.executionStep ? 'live · ' + record.executionStep : 'execution live');
          if (bits.length) card.append(text('p', 'meta', bits.join(' · ')));
          if (site) {
            const actions = document.createElement('div');
            actions.className = 'actions';
            const open = document.createElement('a');
            open.className = 'btn';
            open.href = site;
            open.textContent = 'Open';
            actions.append(open);
            card.append(actions);
          }
          if (!revealed) {
            card.classList.add('enter');
            card.style.animationDelay = Math.min(list.children.length, 8) * 50 + 'ms';
          }
          list.append(card);
        }
        revealed = true;
      }

      async function refresh() {
        try {
          const response = await fetch('/api/processes', { cache: 'no-store' });
          if (!response.ok) throw new Error('Request failed');
          const payload = await response.json();
          render(Array.isArray(payload.processes) ? payload.processes : []);
        } catch (error) {
          status.textContent = 'Could not read the registry.';
        }
      }

      function followInternalPage(event) {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
            { opacity: 0, transform: 'translateY(24px)' },
          ],
          { duration: 460, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
        );
        leaving.finished.then(() => {
          window.location.assign(url.href);
        });
      }

      document.addEventListener('click', followInternalPage);
      refresh();
      setInterval(refresh, 4000);
    })();
  </script>
</body>
</html>`
}
