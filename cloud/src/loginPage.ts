export function renderLoginPage(options: { google: boolean; github: boolean; cli: string }): string {
  const cli = JSON.stringify(options.cli)
  const providers = [
    options.google ? `<button type="button" data-provider="google">Continue with Google</button>` : '',
    options.github ? `<button type="button" data-provider="github">Continue with GitHub</button>` : '',
  ].join('')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in · Living Plan</title>
  <style>
    body { margin: 0; font-family: "DM Sans", Inter, sans-serif; background: #f7f6f3; color: #1c1917; }
    main { max-width: 24rem; margin: 4rem auto; padding: 0 1.25rem; }
    h1 { font-size: 1.4rem; }
    form, .providers { display: grid; gap: 0.75rem; }
    label { display: grid; gap: 0.3rem; font-size: 0.9rem; }
    input, button { font: inherit; padding: 0.65rem 0.75rem; border-radius: 0.5rem; }
    input { border: 1px solid #d6d3d1; }
    button { border: 0; background: #1c1917; color: white; cursor: pointer; }
    p { color: #57534e; }
    .error { color: #9f1239; min-height: 1.2rem; }
  </style>
</head>
<body>
  <main>
    <h1>Sign in</h1>
    <p>This account hosts plans on this server. The local app on your machine stays separate.</p>
    <div class="providers">${providers}</div>
    <form>
      <label>Email <input name="email" type="email" autocomplete="username" required /></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required minlength="8" /></label>
      <button type="submit">Sign in</button>
      <button type="button" data-signup>Create an account</button>
      <div class="error" role="alert"></div>
    </form>
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
