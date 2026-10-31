import { accountMenuHtml, hostToolbarCss } from '../../src/hostToolbar'
import { buildPlanToc, renderPlanTocHtml } from '../../src/planToc'
import { planPageStyles } from '../../src/planPageStyles'
import { themeBootstrapScript } from '../../src/themeBootstrap'
import type { AccountSettings } from './accountSettings'

export type CloudPageAssets = {
  planMdxHref: string | null
  planMdxCss: string[]
  selectorHref: string | null
  selectorCss: string[]
  chromeHref?: string | null
  chromeCss?: string[]
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function jsonScript(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

const PLAN_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>'
const WORKFLOW_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/></svg>'

function tabButton(target: 'plan' | 'workflow', label: string, selected: boolean): string {
  const icon = target === 'plan' ? PLAN_ICON : WORKFLOW_ICON
  return `<button type="button" class="tab-btn" role="tab" data-tab-target="${target}" aria-selected="${selected ? 'true' : 'false'}" aria-label="${label}">${icon}</button>`
}

function safeAccent(value: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : '#0f766e'
}

/** Tabs and the contents list. The React shell binds the same controls. */
const PLAN_CHROME_SCRIPT = `<script>
(() => {
  if (window.__planChromeBound) return
  window.__planChromeBound = true
  const decodeToken = (value) => {
    const raw = value.replace(/^#/, '')
    if (!raw) return ''
    try { return decodeURIComponent(raw) } catch { return raw }
  }
  const findPlanTarget = (token) => {
    const decoded = decodeToken(token)
    if (!decoded) return null
    const ids = decoded.startsWith('plan-') ? [decoded, decoded.slice(5)] : [decoded, 'plan-' + decoded]
    for (const id of ids) {
      const byId = document.getElementById(id)
      if (byId) return byId
    }
    for (const ref of ids) {
      const byRef = document.querySelector('[data-plan-ref="' + CSS.escape(ref) + '"]')
      if (byRef) return byRef
    }
    return null
  }
  const currentTab = () => document.querySelector('[data-tab-target][aria-selected="true"]')?.getAttribute('data-tab-target') || 'plan'
  const updateTocCurrent = () => {
    const links = [...document.querySelectorAll('#plan-toc a[data-toc]')]
    if (!links.length) return
    let current = null
    if (currentTab() === 'plan') {
      const line = window.scrollY + 96
      for (const link of links) {
        if (link.getAttribute('data-toc') !== 'section') continue
        const section = findPlanTarget(link.getAttribute('data-toc-target') || '')
        if (!section) continue
        if (section.getBoundingClientRect().top + window.scrollY <= line) current = link
      }
      if (!current) current = links.find((link) => link.getAttribute('data-toc') === 'section') || null
    } else {
      current = links.find((link) => link.getAttribute('data-toc') === 'workflow') || null
    }
    for (const link of links) {
      if (link === current) link.setAttribute('aria-current', 'true')
      else link.removeAttribute('aria-current')
    }
  }
  const tocIsDocked = () => {
    const nav = document.getElementById('plan-toc')
    return Boolean(nav && getComputedStyle(nav).getPropertyValue('--toc-dock').trim() === '1')
  }
  const setTocOpen = (open) => {
    const nav = document.getElementById('plan-toc')
    const backdrop = document.getElementById('plan-toc-backdrop')
    const toggle = document.querySelector('[data-toc-toggle]')
    if (!nav) return
    const docked = tocIsDocked()
    nav.dataset.open = !docked && open ? 'true' : 'false'
    nav.inert = docked || !open
    if (toggle) toggle.setAttribute('aria-expanded', !docked && open ? 'true' : 'false')
    if (backdrop) backdrop.hidden = docked || !open
  }
  const activateTab = (target) => {
    window.dispatchEvent(new CustomEvent('living-plan-activate-tab', { detail: { tab: target } }))
    document.querySelectorAll('[data-tab-target]').forEach((node) => {
      node.setAttribute('aria-selected', node.getAttribute('data-tab-target') === target ? 'true' : 'false')
    })
    document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
      panel.hidden = panel.getAttribute('data-tab-panel') !== target
    })
    if (target === 'workflow') requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    updateTocCurrent()
  }
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const tab = target.closest('[data-tab-target]')
    if (tab) {
      const name = tab.getAttribute('data-tab-target')
      if (name === 'plan' || name === 'workflow') activateTab(name)
      return
    }
    if (target.closest('[data-toc-toggle]')) {
      const nav = document.getElementById('plan-toc')
      setTocOpen(nav?.dataset.open !== 'true')
      return
    }
    if (target.closest('#plan-toc-backdrop')) {
      setTocOpen(false)
      return
    }
    const tocLink = target.closest('#plan-toc a[data-toc]')
    if (!tocLink) return
    event.preventDefault()
    setTocOpen(false)
    const kind = tocLink.getAttribute('data-toc')
    const ref = tocLink.getAttribute('data-toc-target') || ''
    if (kind === 'workflow' || kind === 'workflow-step') activateTab('workflow')
    else {
      activateTab('plan')
      const section = findPlanTarget(ref)
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  })
  window.addEventListener('scroll', () => updateTocCurrent(), { passive: true })
  window.addEventListener('resize', () => setTocOpen(document.getElementById('plan-toc')?.dataset.open === 'true'))
  setTocOpen(false)
  updateTocCurrent()
})()
</script>`

/** The hosted plan page, using the same shell as the Start plan route. */
export function renderCloudPage(input: {
  basePath: string
  title: string
  source: string
  mode: string
  responses: unknown
  comments: unknown
  review: unknown
  accent: string
  pageWidth: 'default' | 'wide' | 'full'
  diffsTheme: string
  wrapCode: boolean
  owner: boolean
  email: string
  name?: string
  settings: AccountSettings
  assets: CloudPageAssets
}): string {
  const boot = jsonScript({
    source: input.source,
    title: input.title,
    responses: input.responses ?? {},
    locked: false,
    snapshots: [],
    headSnapshotId: null,
  })
  const css = [...input.assets.planMdxCss, ...input.assets.selectorCss, ...(input.assets.chromeCss ?? [])]
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}" />`)
    .join('\n')
  const planMdx = input.assets.planMdxHref
    ? `<script type="module" src="${escapeHtml(input.assets.planMdxHref)}"></script>`
    : ''
  const selector = input.assets.selectorHref
    ? `<script type="module" src="${escapeHtml(input.assets.selectorHref)}"></script>`
    : ''
  const chrome = input.owner && input.assets.chromeHref
    ? `<script>window.__LIVE_PLAN_THEME_URL__ = "/api/account/settings";</script>\n<script type="module" src="${escapeHtml(input.assets.chromeHref)}"></script>`
    : ''
  const account = input.owner
    ? accountMenuHtml(input.name || input.email || 'Account')
    : `<a class="titlebar-user" href="/login">Sign in</a>`
  const accent = safeAccent(input.accent)
  const toc = renderPlanTocHtml(buildPlanToc(input.source))
  return `<!doctype html>
<html lang="en" data-plan-host="cloud" data-accent="${escapeHtml(accent)}" data-layout="${escapeHtml(input.pageWidth)}" data-diffs-theme="${escapeHtml(input.diffsTheme)}" data-wrap-code="${input.wrapCode ? 'true' : 'false'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.title)} · Living Plan</title>
  <link rel="icon" type="image/png" href="/favicon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <script>${themeBootstrapScript}</script>
  <style>${hostToolbarCss}${planPageStyles}
    :root, :root[data-theme="dark"] { --accent: ${accent}; }
  </style>
  ${css}
</head>
<body class="layout-${escapeHtml(input.pageWidth)}" data-plan-mode="${escapeHtml(input.mode)}" data-plan-host="cloud">
  <header class="titlebar">
    <div class="plan-details" data-plan-details>
      <button type="button" class="logo-btn" data-plan-details-toggle aria-expanded="false" aria-controls="plan-card" aria-label="Plan details">
        <img class="titlebar-logo" src="/favicon.png" alt="" width="29" height="29" />
      </button>
      <div class="plan-card" id="plan-card" data-plan-card hidden>
        <div class="facts">
          <span class="fact" title="Mode · ${escapeHtml(input.mode)}"><span class="val">${escapeHtml(input.mode)}</span></span>
        </div>
      </div>
    </div>
    <h1 class="brand" id="plan-title">${escapeHtml(input.title)}</h1>
    <div class="chrome-tools">
      <div class="tabs" role="tablist" aria-label="Living Plan views">
        ${tabButton('plan', 'Plan', true)}
        ${tabButton('workflow', 'Workflow', false)}
      </div>
      ${account}
    </div>
  </header>
  ${toc}
  <div class="shell">
    <section class="tab-panel" data-tab-panel="plan" role="tabpanel">
      <main class="stack">
        <div id="plan-mdx-root" class="plan-mdx-pending"></div>
      </main>
    </section>
    <section class="tab-panel" data-tab-panel="workflow" role="tabpanel" hidden>
      <div id="execution-root"></div>
    </section>
  </div>
  <script type="application/json" id="living-plan-mdx">${boot}</script>
  <script type="application/json" id="living-plan-comments">${jsonScript(input.comments ?? [])}</script>
  <script type="application/json" id="living-plan-review">${jsonScript(input.review ?? null)}</script>
  <script>window.__LIVE_PLAN_BASE__ = ${JSON.stringify(input.basePath)}; window.__LIVE_PLAN_TRANSPORT__ = "websocket"; window.__LIVE_PLAN_HOST__ = "cloud";</script>
  ${planMdx}
  ${selector}
  ${chrome}
  ${PLAN_CHROME_SCRIPT}
</body>
</html>`
}
