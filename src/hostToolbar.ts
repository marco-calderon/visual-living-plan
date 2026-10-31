function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/** Title bar shared by the cloud dashboard and settings pages, and by the local dashboard. */
export function renderHostToolbar(input: { title: string; logoHref: string; endHtml: string }): string {
  return `<header class="titlebar">
    <a class="logo-btn" href="${escapeHtml(input.logoHref)}" aria-label="Living Plan">
      <img class="titlebar-logo" src="/favicon.png" alt="" width="29" height="29" />
    </a>
    <h1 class="brand">${escapeHtml(input.title)}</h1>
    <div class="chrome-tools">
      ${input.endHtml}
    </div>
  </header>`
}

/** User control in the top-right of the cloud toolbar. React replaces it with the menu. */
export function accountMenuHtml(label: string): string {
  const safe = escapeHtml(label)
  return `<div class="account-menu" data-account-menu data-label="${safe}"><button type="button" class="titlebar-user" aria-haspopup="menu" aria-expanded="false">${safe}</button></div>`
}

export const hostToolbarCss = `
.titlebar {
  position: sticky;
  top: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 3.75rem;
  padding: 8px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
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
.logo-btn:focus-visible,
.titlebar-action:focus-visible,
.titlebar-user:focus-visible {
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
  gap: 12px;
  flex-wrap: wrap;
  margin-left: auto;
}
.titlebar-action,
.titlebar-user {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  border: 1px solid var(--ink);
  border-radius: 9999px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  text-decoration: none;
  cursor: pointer;
}
.titlebar-action { padding: 0 16px; }
.titlebar-user { padding: 0 12px 0 14px; }
.account-menu { display: flex; }
.plan-menu-positioner { z-index: 30; }
.plan-menu-popup {
  box-sizing: border-box;
  min-width: 11rem;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--canvas);
  color: var(--ink);
  box-shadow: rgba(0, 0, 0, 0.08) 0px 4px 6px;
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
  width: 100%;
  padding: 8px 12px;
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
.plan-menu-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
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
`
