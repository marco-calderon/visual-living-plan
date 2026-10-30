export const FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />`

/** Document-family styles from DESIGN.md, shared by the sign-in and signed-in pages. */
export const ACCOUNT_STYLES = `
    :root {
      color-scheme: light;
      --ink: #18181b;
      --charcoal: #27272a;
      --steel: #71717a;
      --canvas: #ffffff;
      --surface: #f4f4f5;
      --hairline: #e4e4e7;
      --accent: #1d4ed8;
      --primary: #09090b;
      --on-primary: #ffffff;
      --danger: #d45656;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        color-scheme: dark;
        --ink: #fafafa;
        --charcoal: #e4e4e7;
        --steel: #a1a1aa;
        --canvas: #0c0c0e;
        --surface: #18181b;
        --hairline: #27272a;
        --accent: #93c5fd;
        --primary: #fafafa;
        --on-primary: #0c0c0e;
        --danger: #f0a8a8;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--canvas);
      color: var(--charcoal);
      font-family: "DM Sans", Inter, "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 16px;
      line-height: 1.5;
    }
    main { width: min(24rem, calc(100% - 32px)); margin: 64px auto; }
    .kicker { margin: 0 0 12px; letter-spacing: 0.08em; text-transform: uppercase; font-size: 12px; font-weight: 600; color: var(--accent); }
    .card {
      background: var(--surface);
      border: 1px solid var(--hairline);
      border-radius: 16px;
      padding: 16px;
    }
    h1 { margin: 0 0 8px; color: var(--ink); font-size: 24px; font-weight: 600; line-height: 1.3; }
    p { margin: 0 0 16px; color: var(--steel); font-size: 14px; line-height: 1.5; }
    form, .providers { display: grid; gap: 12px; }
    .providers:empty { display: none; }
    label { display: grid; gap: 4px; color: var(--ink); font-size: 14px; font-weight: 500; }
    input {
      height: 40px;
      padding: 0 12px;
      border: 1px solid var(--hairline);
      border-radius: 8px;
      background: var(--canvas);
      color: var(--ink);
      font: inherit;
    }
    input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
    button {
      height: 40px;
      padding: 11px 24px;
      border-radius: 9999px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      line-height: 1.4;
      cursor: pointer;
    }
    button.primary { border: 0; background: var(--primary); color: var(--on-primary); }
    button.secondary { border: 1px solid var(--ink); background: transparent; color: var(--ink); }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      color: var(--ink);
    }
    .error { color: var(--danger); min-height: 1.2rem; font-size: 14px; }
`

/** Shown after sign-in, including at /review. Browsers may still follow the old permanent redirect from / to /review. */
export function renderHomePage(email: string): string {
  const who = email ? `Signed in as ${escapeHtml(email)}.` : 'Signed in.'
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Signed in · Living Plan</title>
  <link rel="icon" type="image/png" href="/favicon.png" />
  ${FONT_LINK}
  <style>${ACCOUNT_STYLES}</style>
</head>
<body>
  <main>
    <p class="kicker">Living Plan</p>
    <section class="card">
      <h1>Signed in</h1>
      <p>${who}</p>
      <p>If a terminal is waiting on account login, close this window and return to it.</p>
      <p>Host a plan from that machine with <code>live-plan serve path/to/work.plan.md --cloud</code>. The command prints the plan URL.</p>
    </section>
  </main>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

export function renderLoginPage(options: { google: boolean; github: boolean; cli: string }): string {
  const cli = JSON.stringify(options.cli)
  const providers = [
    options.google ? `<button class="secondary" type="button" data-provider="google">Continue with Google</button>` : '',
    options.github ? `<button class="secondary" type="button" data-provider="github">Continue with GitHub</button>` : '',
  ].join('')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in · Living Plan</title>
  <link rel="icon" type="image/png" href="/favicon.png" />
  ${FONT_LINK}
  <style>${ACCOUNT_STYLES}</style>
</head>
<body>
  <main>
    <p class="kicker">Living Plan</p>
    <section class="card">
      <h1>Sign in</h1>
      <p>This account hosts plans on this server. The local app on your machine stays separate.</p>
      <div class="providers">${providers}</div>
      <form>
        <label>Email <input name="email" type="email" autocomplete="username" required /></label>
        <label>Password <input name="password" type="password" autocomplete="current-password" required minlength="8" /></label>
        <button class="primary" type="submit">Sign in</button>
        <button class="secondary" type="button" data-signup>Create an account</button>
        <div class="error" role="alert"></div>
      </form>
    </section>
  </main>
  <script>
    const cli = ${cli}
    const error = document.querySelector('.error')
    async function finish() {
      if (!cli) { location.href = '/'; return }
      location.href = '/api/auth/cli-session?redirect=' + encodeURIComponent(cli)
    }
    document.querySelectorAll('[data-provider]').forEach((button) => {
      button.addEventListener('click', async () => {
        const response = await fetch('/api/auth/sign-in/social', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider: button.dataset.provider, callbackURL: cli ? '/api/auth/cli-session?redirect=' + encodeURIComponent(cli) : '/' }),
        })
        const payload = await response.json().catch(() => null)
        if (payload && payload.url) location.href = payload.url
        else error.textContent = 'That provider is not available.'
      })
    })
    document.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
      })
      if (!response.ok) { error.textContent = 'Those credentials were not accepted.'; return }
      await finish()
    })
    document.querySelector('[data-signup]').addEventListener('click', async () => {
      const data = new FormData(document.querySelector('form'))
      const email = String(data.get('email') || '')
      const response = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: email.split('@')[0] || 'Account', email, password: data.get('password') }),
      })
      if (!response.ok) { error.textContent = 'Could not create that account.'; return }
      await finish()
    })
  </script>
</body>
</html>`
}
