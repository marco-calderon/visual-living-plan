import { ACCENT_CHOICES, type AccountSettings } from './accountSettings'
import { ACCOUNT_STYLES, FONT_LINK } from './loginPage'
import {
  appearanceSettingsCss,
  appearanceSettingsHtml,
  appearanceSettingsScript,
  settingsDocumentCss,
} from '../../src/appearanceSettings'
import { renderDashboardDocument } from '../../src/dashboardDocument'
import { DIFFS_THEME_PRESETS } from '../../src/diffsTheme'
import { accountMenuHtml, historyBackButtonHtml, historyBackScript, hostToolbarCss, renderHostToolbar } from '../../src/hostToolbar'

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

function accountShell(title: string, body: string, label: string, scripts = ''): string {
  return `<!doctype html>
<html lang="en" data-plan-host="cloud">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · Living Plan</title>
  <link rel="icon" type="image/png" href="/favicon.png" />
  ${FONT_LINK}
  <style>${ACCOUNT_STYLES}${PAGE_STYLES}${hostToolbarCss}</style>
</head>
<body>
  ${renderHostToolbar({ title, logoHref: '/dashboard', endHtml: accountMenuHtml(label) })}
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

export type CloudAccountIdentity = { email: string; name: string; tier: string }

function chromeCss(assets?: SettingsPageAssets): string {
  return (assets?.chromeCss ?? [])
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}" />`)
    .join('\n')
}

function chromeJs(assets?: SettingsPageAssets): string {
  if (!assets?.chromeHref) return ''
  return `<script>window.__LIVE_PLAN_THEME_URL__ = "/api/account/settings";</script>\n<script type="module" src="${escapeHtml(assets.chromeHref)}"></script>`
}

function accountSection(account: CloudAccountIdentity): string {
  return `<section class="block settings-section" data-account-section data-host-panel="cloud">
      <div class="settings-kicker">Account</div>
      <h3>Signed in as ${escapeHtml(account.email)}</h3>
      <p class="settings-copy">Name <strong>${escapeHtml(account.name || account.email)}</strong></p>
      <p class="settings-copy">Tier <strong>${escapeHtml(account.tier)}</strong></p>
      <p class="settings-copy">If a terminal is waiting on account login, close this window and return to it. Host a plan from that machine with <code>live-plan serve path/to/work.plan.md --cloud</code>. Each publish stores the plan here. Loopback plans stay separate and do not require this account.</p>
      <p class="settings-meta" data-settings-error role="alert"></p>
    </section>`
}

/** Same control dashboard as the local host. The user menu is the only account control in the toolbar. */
export function renderPlansDashboard(account: CloudAccountIdentity, assets?: SettingsPageAssets): string {
  return renderDashboardDocument({
    host: 'cloud',
    apiPath: '/api/account/dashboard',
    logoHref: '/dashboard',
    lede: 'Hosted plans for this account. Summaries follow the local day, week, and month. Each published version is stored on this host, and the latest 10 are kept. Loopback plans stay on your machine.',
    toolbarHtml: accountMenuHtml(account.name || account.email),
    headExtra: `<link rel="icon" type="image/png" href="/favicon.png" />\n${chromeCss(assets)}`,
    footScript: `${SIGN_OUT_SCRIPT}${chromeJs(assets)}`,
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
    input.name || input.email,
  )
}

export type SettingsPageAssets = {
  chromeHref: string | null
  chromeCss: string[]
}

export type ClientManifestEntry = {
  file: string
  css?: string[]
  name?: string
  imports?: string[]
}

/** Settings hydrates the collapse and code-wrap switch only. The plan selector also mounts comments. */
export function settingsChromeFromManifest(
  manifest: Record<string, ClientManifestEntry> | null,
): SettingsPageAssets {
  const empty: SettingsPageAssets = { chromeHref: null, chromeCss: [] }
  if (!manifest) return empty
  const key =
    'client/settingsChrome.tsx' in manifest
      ? 'client/settingsChrome.tsx'
      : Object.entries(manifest).find(([, entry]) => entry.name === 'settingsChrome')?.[0]
  const chrome = key ? manifest[key] : undefined
  if (!key || !chrome?.file) return empty
  const css: string[] = []
  const seen = new Set<string>()
  const visit = (name: string) => {
    if (seen.has(name)) return
    seen.add(name)
    const entry = manifest[name]
    if (!entry) return
    for (const file of entry.css ?? []) css.push(`/client/${file}`)
    for (const imported of entry.imports ?? []) visit(imported)
  }
  visit(key)
  return { chromeHref: `/client/${chrome.file}`, chromeCss: css }
}

export function renderSettingsPage(
  settings: AccountSettings,
  account: CloudAccountIdentity,
  assets?: SettingsPageAssets,
): string {
  const saved = 'Saved on this host for your account.'
  const appearance = appearanceSettingsHtml({
    accent: settings.accent,
    pageWidth: settings.pageWidth,
    diffsTheme: settings.diffsTheme,
    wrapCode: settings.wrapCode,
    presets: ACCENT_CHOICES.map((choice) => ({ label: choice.label, accent: choice.accent })),
    widths: APPEARANCE_WIDTHS,
    diffsThemes: DIFFS_THEME_PRESETS,
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
  ${chromeCss(assets)}
  <style>
    ${settingsDocumentCss}
    ${hostToolbarCss}
    ${appearanceSettingsCss}
  </style>
</head>
<body class="layout-${escapeHtml(settings.pageWidth)}">
  ${renderHostToolbar({
    title: 'Settings',
    logoHref: '/dashboard',
    startHtml: historyBackButtonHtml(),
    endHtml: accountMenuHtml(account.name || account.email),
  })}
  <main class="settings-page">
    <div class="settings-stack">
      ${accountSection(account)}
      ${appearance}
    </div>
  </main>
  ${appearanceSettingsScript('/api/account/settings')}
  ${historyBackScript()}
  ${chromeJs(assets)}
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
    'Account',
  )
}
