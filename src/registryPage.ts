/** Index of every plan the registry knows about. Each card opens that plan's site. */
export function renderRegistryPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Running plans · Living Plan</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560;9..144,680&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    :root {
      color-scheme: light;
      --ink: #14211c;
      --muted: #4d6158;
      --paper: #f4f7f4;
      --panel: rgba(255, 255, 255, 0.86);
      --line: rgba(20, 33, 28, 0.12);
      --accent: #0f766e;
      --shadow: 0 18px 40px rgba(20, 33, 28, 0.08);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        color-scheme: dark;
        --ink: #e8f3ee;
        --muted: #b7c7c0;
        --paper: #101816;
        --panel: rgba(22, 36, 32, 0.9);
        --line: rgba(232, 243, 238, 0.14);
        --accent: #2dd4bf;
        --shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: "IBM Plex Sans", sans-serif;
      background:
        radial-gradient(900px 400px at 0% -10%, rgba(15, 118, 110, 0.16), transparent 50%),
        var(--paper);
    }
    main { width: min(760px, calc(100% - 2rem)); margin: 0 auto; padding: 2.5rem 0 4rem; }
    .kicker { margin: 0 0 0.4rem; letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.75rem; font-weight: 600; color: var(--accent); }
    h1 { font-family: Fraunces, serif; font-size: clamp(2.2rem, 5vw, 3.4rem); line-height: 0.95; margin: 0 0 0.7rem; }
    .lede { margin: 0 0 1.4rem; color: var(--muted); max-width: 38rem; line-height: 1.5; }
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
    h2 { margin: 0; font-size: 1.2rem; font-family: Fraunces, serif; }
    h2 a { color: inherit; text-decoration: none; }
    h2 a:hover { color: var(--accent); }
    .mode { color: var(--muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; }
    .path { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 0.78rem; word-break: break-all; margin: 0.45rem 0; }
    .meta { color: var(--muted); font-size: 0.88rem; line-height: 1.45; margin: 0.15rem 0; }
    .actions { display: flex; gap: 0.45rem; margin-top: 0.75rem; }
    a.btn {
      display: inline-flex;
      text-decoration: none;
      border-radius: 999px;
      padding: 0.45rem 0.8rem;
      background: var(--accent);
      color: #f4fffc;
      font-weight: 600;
      font-size: 0.88rem;
    }
  </style>
</head>
<body>
  <main>
    <p class="kicker">Living Plan</p>
    <h1>Running plans</h1>
    <p class="lede">Plans started from the CLI. Each one is linked to a directory and that directory's git status. Open an entry to work in its site.</p>
    <p class="status" id="status">Loading…</p>
    <ul id="list"></ul>
  </main>
  <script>
    (() => {
      const status = document.getElementById('status');
      const list = document.getElementById('list');

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
          list.append(card);
        }
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

      refresh();
      setInterval(refresh, 4000);
    })();
  </script>
</body>
</html>`
}
