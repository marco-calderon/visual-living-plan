/**
 * Invisible capture for development. The page does not render these messages.
 * `live-plan logs` reads what this posts.
 */
export function clientLogScript(endpoint: string): string {
  const target = JSON.stringify(endpoint)
  return `(() => {
  if (window.__livingPlanLogsInstalled) return;
  window.__livingPlanLogsInstalled = true;
  const endpoint = ${target};
  const recent = new Map();

  function formatArg(value) {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message || value.name;
    try { return JSON.stringify(value); } catch { return String(value); }
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
    }).catch(() => {});
  }

  window.__livingPlanReport = (level, message, detail, source) => {
    send(level, message, detail, source || 'page');
  };

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
})();`
}
