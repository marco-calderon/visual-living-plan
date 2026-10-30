import {
  ACCENT_CHOICES,
  DIFFS_THEMES,
  PAGE_WIDTHS,
  type AccountSettings,
} from './accountSettings'
import { ACCOUNT_STYLES, FONT_LINK } from './loginPage'

export type HostedPlan = { id: string; title: string; mode: string }

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

const DASHBOARD_STYLES = `
    main { width: min(40rem, calc(100% - 32px)); display: grid; gap: 16px; }
    .row { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
    .meta { margin: 0; color: var(--steel); font-size: 14px; }
    .meta strong { color: var(--ink); font-weight: 600; }
    select {
      height: 40px;
      padding: 0 12px;
      border: 1px solid var(--hairline);
      border-radius: 8px;
      background: var(--canvas);
      color: var(--ink);
      font: inherit;
    }
    select:focus, input[type="color"]:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
    .check { display: flex; align-items: center; gap: 8px; color: var(--ink); font-size: 14px; font-weight: 500; }
    .plans { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
    .plans a { color: var(--accent); font-weight: 600; text-decoration: none; }
    .plans li { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
    .host-note { margin: 0; }
`

function accentOptions(selected: string): string {
  const known = ACCENT_CHOICES.some((choice) => choice.accent === selected)
  const custom = known ? '' : `<option value="${escapeHtml(selected)}" selected>Custom ${escapeHtml(selected)}</option>`
  return (
    custom +
    ACCENT_CHOICES.map((choice) => {
      const on = choice.accent === selected ? ' selected' : ''
      return `<option value="${choice.accent}"${on}>${escapeHtml(choice.label)}</option>`
    }).join('')
  )
}

function widthOptions(selected: string): string {
  return PAGE_WIDTHS.map((id) => `<option value="${id}"${id === selected ? ' selected' : ''}>${id}</option>`).join('')
}

function diffsOptions(selected: string): string {
  return DIFFS_THEMES.map((id) => `<option value="${id}"${id === selected ? ' selected' : ''}>${id}</option>`).join('')
}

export function accountSettingsForm(settings: AccountSettings): string {
  return `<form data-account-settings>
      <label>Accent
        <select name="accent">${accentOptions(settings.accent)}</select>
      </label>
      <label>Custom accent
        <input name="customAccent" type="color" value="${escapeHtml(settings.accent)}" />
      </label>
      <label>Page width
        <select name="pageWidth">${widthOptions(settings.pageWidth)}</select>
      </label>
      <label>Code theme
        <select name="diffsTheme">${diffsOptions(settings.diffsTheme)}</select>
      </label>
      <label class="check"><input name="wrapCode" type="checkbox"${settings.wrapCode ? ' checked' : ''} /> Wrap long lines in code</label>
      <button class="primary" type="submit">Save on this host</button>
      <div class="error" role="alert"></div>
    </form>`
}

export function accountSettingsScript(): string {
  return `<script>
    document.querySelectorAll('[data-account-settings]').forEach((form) => {
      const custom = form.querySelector('[name="customAccent"]')
      if (custom) custom.addEventListener('input', () => { custom.dataset.touched = 'true' })
      form.addEventListener('submit', async (event) => {
        event.preventDefault()
        const data = new FormData(form)
        const accent = custom && custom.dataset.touched === 'true' ? custom.value : data.get('accent')
        const error = form.querySelector('.error')
        const response = await fetch('/api/account/settings', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            accent,
            pageWidth: data.get('pageWidth'),
            diffsTheme: data.get('diffsTheme'),
            wrapCode: data.get('wrapCode') === 'on',
          }),
        })
        if (!response.ok) { if (error) error.textContent = 'Could not save those settings.'; return }
        location.reload()
      })
    })
  </script>`
}

/** Shown on a hosted plan. The local plan page uses a different panel. */
export function cloudHostPanel(input: { owner: boolean; email: string; settings: AccountSettings }): string {
  if (!input.owner) {
    return `<section class="host-panel" data-host-panel="cloud" data-plan-host="cloud">
      <p class="kicker">Hosted plan</p>
      <p class="host-note">This plan is on the cloud host. Its account keeps appearance settings here. A loopback plan on your machine does not use this account.</p>
    </section>`
  }
  return `<section class="host-panel" data-host-panel="cloud" data-plan-host="cloud">
      <p class="kicker">Hosted plan</p>
      <h2>Account settings</h2>
      <p class="host-note">Signed in as ${escapeHtml(input.email)}. These settings are saved on this host for your account. They are not written to the theme file on your machine.</p>
      ${accountSettingsForm(input.settings)}
      <p class="host-note"><a href="/dashboard">Open the account dashboard</a></p>
    </section>`
}

/** `/dashboard` is the account page. `/` and `/review` redirect there, including a saved redirect that still opens `/review`. */
export function cloudAccountRoute(pathname: string): 'show' | 'redirect' | null {
  const path = pathname !== '/' ? pathname.replace(/\/+$/, '') : pathname
  if (path === '/dashboard') return 'show'
  if (path === '/' || path === '/review') return 'redirect'
  return null
}

/** Account dashboard for a signed-in cloud session. */
export function renderDashboard(input: {
  email: string
  name: string
  tier: string
  settings: AccountSettings
  plans: HostedPlan[]
}): string {
  const plans = input.plans.length
    ? `<ul class="plans">${input.plans
        .map(
          (plan) =>
            `<li><a href="/plans/${escapeHtml(plan.id)}/">${escapeHtml(plan.title)}</a><span>${escapeHtml(plan.mode)}</span></li>`,
        )
        .join('')}</ul>`
    : `<p class="host-note">No hosted plan is open. From your machine, run <code>live-plan serve path/to/work.plan.md --cloud</code>.</p>`
  return `<!doctype html>
<html lang="en" data-plan-host="cloud">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dashboard · Living Plan</title>
  <link rel="icon" type="image/png" href="/favicon.png" />
  ${FONT_LINK}
  <style>${ACCOUNT_STYLES}${DASHBOARD_STYLES}</style>
</head>
<body>
  <main>
    <p class="kicker">Living Plan</p>
    <section class="card" data-host-panel="cloud">
      <div class="row"><h1>Dashboard</h1><button class="secondary" type="button" data-sign-out>Sign out</button></div>
      <p>Signed in as ${escapeHtml(input.email)}.</p>
      <p class="meta">Name <strong>${escapeHtml(input.name || input.email)}</strong></p>
      <p class="meta">Tier <strong>${escapeHtml(input.tier)}</strong></p>
      <p class="host-note">If a terminal is waiting on account login, close this window and return to it. Host a plan from that machine with <code>live-plan serve path/to/work.plan.md --cloud</code>. Loopback plans stay separate and do not require this account.</p>
    </section>
    <section class="card">
      <h1>Settings</h1>
      <p>Saved on this host for your signed-in session. A local plan still uses the theme file beside that plan.</p>
      ${accountSettingsForm(input.settings)}
    </section>
    <section class="card">
      <h1>Hosted plans</h1>
      ${plans}
    </section>
  </main>
  ${accountSettingsScript()}
  <script>
    document.querySelector('[data-sign-out]')?.addEventListener('click', async () => {
      await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
      location.href = '/login'
    })
  </script>
</body>
</html>`
}
