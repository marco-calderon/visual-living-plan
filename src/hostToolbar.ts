function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

const HISTORY_BACK_ICON =
  '<svg class="lucide lucide-arrow-left" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>'

/** Settings control above the page content. It returns to the previous history entry and does not target a route. */
export function historyBackButtonHtml(): string {
  return `<button type="button" class="settings-back" data-history-back>${HISTORY_BACK_ICON}Back</button>`
}

/** Binds the settings history-back control. */
export function historyBackScript(): string {
  return `<script>document.querySelector('[data-history-back]')?.addEventListener('click', () => { history.back() })</script>`
}

export type PlanHost = 'local' | 'cloud'

/**
 * The Local and Cloud switch in a toolbar. Styles hide it in a browser. Inside the desktop app the
 * other side is a `living-plan://switch/<mode>` link, which the app follows ([ADR 0038]).
 *
 * [ADR 0038]: ../docs/architecture/decisions/0038-desktop-setup-and-cloud.md
 */
export function desktopModeSwitchHtml(host: PlanHost): string {
  const side = (mode: PlanHost, label: string) =>
    mode === host ? `<span aria-current="true">${label}</span>` : `<a href="living-plan://switch/${mode}">${label}</a>`
  return `<nav class="desktop-mode" aria-label="Where plans run">${side('local', 'Local')}${side('cloud', 'Cloud')}</nav>`
}

/** Title bar shared by the cloud dashboard and settings pages, and by the local dashboard. */
export function renderHostToolbar(input: { title: string; logoHref: string; endHtml: string; host?: PlanHost }): string {
  return `<header class="titlebar">
    <a class="logo-btn" href="${escapeHtml(input.logoHref)}" aria-label="Living Plan">
      <img class="titlebar-logo" src="/favicon.png" alt="" width="29" height="29" />
    </a>
    <h1 class="brand">${escapeHtml(input.title)}</h1>
    <div class="chrome-tools">
      ${desktopModeSwitchHtml(input.host ?? 'local')}
      ${input.endHtml}
    </div>
  </header>`
}

/** User control in the top-right of the cloud toolbar. React replaces it with the menu. */
export function accountMenuHtml(label: string): string {
  const safe = escapeHtml(label)
  return `<div class="account-menu" data-account-menu data-label="${safe}"><button type="button" class="titlebar-user" aria-haspopup="menu" aria-expanded="false">${safe}</button></div>`
}

/**
 * The bar itself: sticky in the page flow, with the logo, the title, and the tools row. Dashboard,
 * account, and settings pages lay out with it. A plan page does not: planPage.css fixes its bar
 * above a column that starts below it, and these rules would put the bar in the flow a second time.
 */
export const hostToolbarBarCss = `
.titlebar {
  position: sticky;
  top: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-height: 3.75rem;
  padding: var(--space-xs) var(--space-md);
  background: var(--surface);
  border-bottom: 1px solid var(--hairline);
}
.logo-btn {
  width: 36px;
  height: 36px;
  padding: 0;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 0;
  border-radius: 50%;
  background: transparent;
  text-decoration: none;
}
.logo-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.titlebar-logo {
  width: 29px;
  height: 29px;
  display: block;
  border-radius: 50%;
}
.brand {
  flex: 0 0 auto;
  margin: 0;
  font-weight: 600;
  font-size: 20px;
  line-height: 1.4;
  color: var(--ink);
  white-space: nowrap;
}
.chrome-tools {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-sm);
  flex-wrap: wrap;
  margin-left: auto;
}
.offline-state {
  margin: 0;
  color: var(--muted, #71717a);
  font-size: 0.8rem;
  white-space: nowrap;
}
.offline-state[hidden] { display: none; }
`

/** Buttons, menus, and the Local and Cloud switch inside a host toolbar, on any page that has one. */
export const hostToolbarControlsCss = `
.titlebar-action:focus-visible,
.titlebar-user:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.titlebar-action,
.titlebar-user {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  border: 1px solid var(--hairline-strong, var(--hairline));
  border-radius: 9999px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  padding: var(--space-xs) var(--space-sm);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  text-decoration: none;
  cursor: pointer;
}
.account-menu { display: flex; }
/* Initials stand in for the account name only where a plan toolbar is narrow (src/planPage.css). */
.titlebar-user-initials { display: none; }
.plan-menu-positioner { z-index: 30; }
.plan-menu-popup {
  box-sizing: border-box;
  min-width: 11rem;
  padding: var(--space-xxs);
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--canvas);
  color: var(--ink);
  box-shadow: var(--shadow-popover);
  transform-origin: var(--transform-origin);
  transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out);
}
.plan-menu-popup[data-starting-style],
.plan-menu-popup[data-ending-style] {
  opacity: 0;
  transform: scale(0.95);
}
.plan-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  width: 100%;
  padding: var(--space-xs) var(--space-sm);
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.plan-menu-item[data-highlighted] { background: var(--accent-soft); }
.plan-menu-item[data-disabled] { color: var(--muted); cursor: not-allowed; }
.plan-menu-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.plan-menu-meta { color: var(--muted); font-weight: 500; font-size: 12px; }
.plan-menu-label { display: inline-flex; align-items: center; gap: var(--space-xs, 8px); }
.plan-menu-label svg { display: block; width: 16px; height: 16px; flex: none; }
.plan-menu-danger,
.plan-menu-danger[data-highlighted] { color: #dc2626; }
@media (prefers-color-scheme: dark) {
  .plan-menu-danger,
  .plan-menu-danger[data-highlighted] { color: #f87171; }
}
.plan-menu-separator { height: 1px; margin: var(--space-xxs) 0; border: 0; background: var(--line); }
.titlebar-action,
.titlebar-user,
.plan-menu-item {
  transition: transform 160ms var(--ease-out), background-color 150ms ease, color 150ms ease, border-color 150ms ease;
}
.titlebar-action:active,
.titlebar-user:active { transform: scale(0.97); }
@media (prefers-reduced-motion: reduce) {
  .plan-menu-popup,
  .titlebar-action,
  .titlebar-user,
  .plan-menu-item { transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease; }
  .titlebar-action:active,
  .titlebar-user:active,
  .plan-menu-popup[data-starting-style],
  .plan-menu-popup[data-ending-style] { transform: none; }
}
/* Local and Cloud, shown only inside the desktop app, which sets data-desktop on the root. */
.desktop-mode { display: none; }
html[data-desktop] .desktop-mode {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--hairline);
  border-radius: 9999px;
  background: var(--canvas);
}
.desktop-mode a,
.desktop-mode span {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border-radius: 9999px;
  color: var(--muted, var(--steel));
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
}
.desktop-mode [aria-current="true"] { background: var(--primary); color: var(--on-primary); }
.desktop-mode a:hover { color: var(--ink); }
.desktop-mode a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.desktop-only { display: none; }
html[data-desktop] .desktop-only { display: revert; }
`

/** The whole host toolbar, for pages that lay out with the sticky bar. */
export const hostToolbarCss = hostToolbarBarCss + hostToolbarControlsCss
