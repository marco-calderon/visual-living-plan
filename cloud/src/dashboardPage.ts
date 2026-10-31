import { ACCENT_CHOICES, type AccountSettings } from './accountSettings'
import { ACCOUNT_STYLES, FONT_LINK } from './loginPage'
import { appearanceSettingsCss, appearanceSettingsHtml, appearanceSettingsScript } from '../../src/appearanceSettings'
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

const APPEARANCE_WIDTHS = [
  { id: 'default', label: 'Default' },
  { id: 'wide', label: 'Wide' },
  { id: 'full', label: 'Full' },
]

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

/** Same control dashboard as the local host, plus this account so Settings lives here. */
export function renderPlansDashboard(account: { email: string; name: string; tier: string }): string {
  const accountHtml = `<section class="account-card" data-account-section data-host-panel="cloud">
      <div class="account-row">
        <div>
          <p class="kicker">Account</p>
          <h2>Account</h2>
        </div>
        <div class="account-actions">
          <a class="refresh" href="/settings">Settings</a>
          <button type="button" class="refresh" data-sign-out>Sign out</button>
        </div>
      </div>
      <p>Signed in as ${escapeHtml(account.email)}.</p>
      <p class="account-meta">Name <strong>${escapeHtml(account.name || account.email)}</strong></p>
      <p class="account-meta">Tier <strong>${escapeHtml(account.tier)}</strong></p>
      <p class="account-note">If a terminal is waiting on account login, close this window and return to it. Host a plan from that machine with <code>live-plan serve path/to/work.plan.md --cloud</code>. Each publish stores the plan here. Loopback plans stay separate and do not require this account.</p>
    </section>`
  return renderDashboardDocument({
    host: 'cloud',
    apiPath: '/api/account/dashboard',
    lede: 'Hosted plans for this account. Summaries follow the local day, week, and month. Each published version is stored on this host, and the latest 10 are kept. Loopback plans stay on your machine.',
    navHtml: '<p class="nav"><a class="link" href="/account">Account</a></p>',
    accountHtml,
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
  const saved = 'Saved on this host for your account.'
  const appearance = appearanceSettingsHtml({
    accent: settings.accent,
    pageWidth: settings.pageWidth,
    diffsTheme: settings.diffsTheme,
    wrapCode: settings.wrapCode,
    presets: ACCENT_CHOICES.map((choice) => ({ label: choice.label, accent: choice.accent })),
    widths: APPEARANCE_WIDTHS,
    accentCopy: 'Pick one of eight presets tuned for light and dark mode, or set a custom hex. Changes save on this host for your account.',
    accentNote: saved,
    widthNote: saved,
    wrapNote: saved,
    diffsNote: saved,
  })
  return `<!doctype html>
<html lang="en" data-plan-host="cloud" data-accent="${escapeHtml(settings.accent)}" data-layout="${escapeHtml(settings.pageWidth)}" data-diffs-theme="${escapeHtml(settings.diffsTheme)}" data-wrap-code="${settings.wrapCode ? 'true' : 'false'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Settings · Living Plan</title>
  <link rel="icon" type="image/png" href="/favicon.png" />
  ${FONT_LINK}
  <style>
    ${ACCOUNT_STYLES}
    ${PAGE_STYLES}
    :root {
      --line: var(--hairline);
      --muted: var(--steel);
      --font-display: "DM Sans", Inter, "Helvetica Neue", Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --control-solid: var(--canvas);
      --tabs-bg: var(--surface);
      --tab-active-bg: var(--primary);
      --tab-active-fg: var(--on-primary);
      --paper: var(--canvas);
      --chip-bg: var(--surface);
      --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
      --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
      --focus: var(--accent);
      --accent-soft: #dbeafe;
      --accent-hover-border: var(--accent);
      --accent-hover-shadow: none;
      --code-inline-bg: var(--surface);
    }
    @media (prefers-color-scheme: dark) {
      :root { --accent-soft: rgba(147, 197, 253, 0.14); }
    }
    main.settings-page { width: min(56rem, calc(100% - 32px)); margin: 32px auto 64px; }
    .settings-page .nav a[aria-current="page"] { text-decoration: underline; }
    .settings-stack button { height: auto; padding: revert; }
    ${appearanceSettingsCss}
  </style>
</head>
<body class="layout-${escapeHtml(settings.pageWidth)}">
  <main class="settings-page">
    ${accountNav('settings')}
    <p class="kicker">Living Plan</p>
    <h1>Settings</h1>
    <div class="settings-stack">
      <section class="block settings-section" data-host-panel="cloud" data-plan-host="cloud">
        <div class="settings-kicker">This host</div>
        <h3>Cloud account</h3>
        <p class="settings-copy">Saved on this host for your signed-in session. A local plan still uses the theme file beside that plan.</p>
        <p class="settings-meta" data-settings-error role="alert"></p>
      </section>
      ${appearance}
    </div>
  </main>
  ${appearanceSettingsScript('/api/account/settings')}
  ${SIGN_OUT_SCRIPT}
</body>
</html>`
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
