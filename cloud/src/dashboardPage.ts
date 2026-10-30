import {
  ACCENT_CHOICES,
  DIFFS_THEMES,
  PAGE_WIDTHS,
  type AccountSettings,
} from './accountSettings'
import { ACCOUNT_STYLES, FONT_LINK } from './loginPage'
import { renderDashboardDocument } from '../../src/dashboardDocument'

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

const PAGE_STYLES = `
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
    .nav { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin: 0 0 8px; }
    .nav a { color: var(--accent); font-weight: 600; text-decoration: none; }
    .plans { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
    .plans a { color: var(--accent); font-weight: 600; text-decoration: none; }
    .plans li { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
    .host-note { margin: 0; }
`

const SIGN_OUT_SCRIPT = `<script>
  document.querySelectorAll('[data-sign-out]').forEach((button) => {
    button.addEventListener('click', async () => {
      await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
      location.href = '/login'
    })
  })
</script>`

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

function accountNav(current: 'dashboard' | 'account' | 'settings'): string {
  const link = (href: string, label: string) =>
    `<a href="${href}"${href === `/${current}` ? ' aria-current="page"' : ''}>${label}</a>`
  return `<p class="nav">${link('/dashboard', 'Dashboard')}${link('/account', 'Account')}${link('/settings', 'Settings')}<button class="secondary" type="button" data-sign-out>Sign out</button></p>`
}

function accountShell(title: string, body: string, scripts = ''): string {
  return `<!doctype html>
<html lang="en" data-plan-host="cloud">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · Living Plan</title>
  <link rel="icon" type="image/png" href="/favicon.png" />
  ${FONT_LINK}
  <style>${ACCOUNT_STYLES}${PAGE_STYLES}</style>
</head>
<body>
  <main>
    ${body}
  </main>
  ${scripts}
  ${SIGN_OUT_SCRIPT}
</body>
</html>`
}

/** Shown on a hosted plan. The local plan page uses a different panel. */
export function cloudHostPanel(input: { owner: boolean; email: string }): string {
  if (!input.owner) {
    return `<section class="host-panel" data-host-panel="cloud" data-plan-host="cloud">
      <p class="kicker">Hosted plan</p>
      <p class="host-note">This plan is on the cloud host. Its account keeps appearance settings here. A loopback plan on your machine does not use this account.</p>
    </section>`
  }
  return `<section class="host-panel" data-host-panel="cloud" data-plan-host="cloud">
      <p class="kicker">Hosted plan</p>
      <h2>On this host</h2>
      <p class="host-note">Signed in as ${escapeHtml(input.email)}. Publishing a version stores the plan on this host. Appearance for your account is on the settings page. It is not written to the theme file on your machine.</p>
      <p class="host-note"><a href="/dashboard">Dashboard</a> · <a href="/account">Account</a> · <a href="/settings">Settings</a></p>
    </section>`
}

export type CloudSurface = 'dashboard' | 'account' | 'settings' | 'redirect'

/** `/dashboard` is the plans dashboard. `/` and `/review` redirect there, including a saved redirect that still opens `/review`. */
export function cloudAccountRoute(pathname: string): CloudSurface | null {
  const path = pathname !== '/' ? pathname.replace(/\/+$/, '') : pathname
  if (path === '/dashboard') return 'dashboard'
  if (path === '/account') return 'account'
  if (path === '/settings') return 'settings'
  if (path === '/' || path === '/review') return 'redirect'
  return null
}

/** Same control dashboard as the local host, for this account's hosted plans. */
export function renderPlansDashboard(): string {
  return renderDashboardDocument({
    host: 'cloud',
    apiPath: '/api/account/dashboard',
    lede: 'Hosted plans for this account. Summaries follow the local day, week, and month. Each published version is stored on this host, and the latest 10 are kept. Loopback plans stay on your machine.',
    navHtml:
      '<p class="nav"><a class="link" href="/account">Account</a><a class="link" href="/settings">Settings</a><button type="button" class="refresh" data-sign-out>Sign out</button></p>',
    headExtra: '<link rel="icon" type="image/png" href="/favicon.png" />',
    footScript: SIGN_OUT_SCRIPT,
  })
}

export function renderAccountPage(input: { email: string; name: string; tier: string }): string {
  return accountShell(
    'Account',
    `${accountNav('account')}
    <p class="kicker">Living Plan</p>
    <section class="card" data-host-panel="cloud">
      <h1>Account</h1>
      <p>Signed in as ${escapeHtml(input.email)}.</p>
      <p class="meta">Name <strong>${escapeHtml(input.name || input.email)}</strong></p>
      <p class="meta">Tier <strong>${escapeHtml(input.tier)}</strong></p>
      <p class="host-note">If a terminal is waiting on account login, close this window and return to it. Host a plan from that machine with <code>live-plan serve path/to/work.plan.md --cloud</code>. Each publish stores the plan here. Loopback plans stay separate and do not require this account.</p>
    </section>`,
  )
}

export function renderSettingsPage(settings: AccountSettings): string {
  return accountShell(
    'Settings',
    `${accountNav('settings')}
    <p class="kicker">Living Plan</p>
    <section class="card" data-host-panel="cloud">
      <h1>Settings</h1>
      <p>Saved on this host for your signed-in session. A local plan still uses the theme file beside that plan.</p>
      ${accountSettingsForm(settings)}
    </section>`,
    accountSettingsScript(),
  )
}

export function renderVersionHistory(input: {
  title: string
  planId: string
  versions: Array<{ seq: number; title: string; createdAt: number }>
}): string {
  const items = input.versions.length
    ? `<ul class="plans">${input.versions
        .map(
          (version) =>
            `<li><a href="/plans/${escapeHtml(input.planId)}/versions/${version.seq}">Version ${version.seq}</a><span>${escapeHtml(new Date(version.createdAt).toISOString())}</span></li>`,
        )
        .join('')}</ul>`
    : '<p class="host-note">No version is stored yet. Publish the plan from the machine that hosts the file.</p>'
  return accountShell(
    input.title,
    `${accountNav('dashboard')}
    <p class="kicker">Living Plan</p>
    <section class="card">
      <h1>${escapeHtml(input.title)}</h1>
      <p>The latest 10 published versions of this plan. Publishing another drops the oldest.</p>
      ${items}
      <p class="host-note"><a href="/plans/${escapeHtml(input.planId)}/">Open the live plan</a></p>
    </section>`,
  )
}
