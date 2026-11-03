import { FileText, Workflow } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../client/ui/button.tsx'
import { hostToolbarCss } from './hostToolbar.ts'
import { planSourceFlags } from './planMdx/source.ts'
import { buildPlanToc, renderPlanTocHtml } from './planToc.ts'
import { bindPlanChrome } from './bindPlanChrome.ts'
import './planPage.css'
import { themeBootstrapScript } from './themeBootstrap.ts'
import { APPEARANCE_MEMORY_KEY, readRememberedAppearance } from '../client/chrome/appearanceMemory.ts'

export type PlanShellProps = {
  title: string
  source: string
  mode: string
  host: 'cloud' | 'local'
  pageWidth: 'default' | 'wide' | 'full'
  accent: string
  diffsTheme: string
  wrapCode: boolean
  accountLabel?: string
  basePath: string
  transport?: 'websocket'
  bootstrap?: string
  children?: ReactNode
}

export function PlanShell({
  title,
  source,
  mode,
  host,
  pageWidth,
  accent,
  diffsTheme,
  wrapCode,
  accountLabel,
  basePath,
  transport,
  bootstrap,
  children,
}: PlanShellProps) {
  const started = useRef(false)
  const [tab, setTab] = useState<'plan' | 'workflow'>('plan')
  const tocHtml = renderPlanTocHtml(buildPlanToc(source))

  useEffect(() => {
    const onTab = (event: Event) => {
      const next = (event as CustomEvent<{ tab?: string }>).detail?.tab
      if (next === 'plan' || next === 'workflow') setTab(next)
    }
    window.addEventListener('living-plan-activate-tab', onTab)
    return () => window.removeEventListener('living-plan-activate-tab', onTab)
  }, [])

  // Settings is a separate page. When Back restores this page from the browser cache, or another tab
  // saves, apply an appearance saved after this page loaded. Only the owner's page uses account settings.
  const loadedAt = useRef(Date.now())
  useEffect(() => {
    if (host !== 'cloud' || !accountLabel) return
    const catchUp = () => {
      const saved = readRememberedAppearance()
      if (!saved || saved.savedAt <= loadedAt.current) return
      loadedAt.current = saved.savedAt
      const root = document.documentElement
      if (saved.diffsTheme) root.dataset.diffsTheme = saved.diffsTheme
      if (typeof saved.wrapCode === 'boolean') root.dataset.wrapCode = saved.wrapCode ? 'true' : 'false'
      if (saved.accent) root.dataset.accent = saved.accent
      if (saved.pageWidth) {
        root.dataset.layout = saved.pageWidth
        document.body.classList.remove('layout-default', 'layout-wide', 'layout-full')
        document.body.classList.add(`layout-${saved.pageWidth}`)
      }
      window.dispatchEvent(new CustomEvent('living-plan-theme', { detail: saved }))
    }
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) catchUp()
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === APPEARANCE_MEMORY_KEY) catchUp()
    }
    window.addEventListener('pageshow', onShow)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('pageshow', onShow)
      window.removeEventListener('storage', onStorage)
    }
  }, [accountLabel, host])

  useEffect(() => {
    if (tab !== 'workflow') return
    const frame = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return () => cancelAnimationFrame(frame)
  }, [tab])

  useLayoutEffect(() => {
    document.documentElement.dataset.planHost = host
    document.documentElement.dataset.layout = pageWidth
    document.documentElement.dataset.diffsTheme = diffsTheme
    document.documentElement.dataset.wrapCode = wrapCode ? 'true' : 'false'
    document.documentElement.dataset.accent = accent
    document.body.dataset.planMode = mode
    document.body.dataset.planHost = host
    document.body.classList.remove('layout-default', 'layout-wide', 'layout-full')
    document.body.classList.add(`layout-${pageWidth}`)
    const win = window as Window & {
      __LIVE_PLAN_BASE__?: string
      __LIVE_PLAN_TRANSPORT__?: string
      __LIVE_PLAN_HOST__?: string
    }
    win.__LIVE_PLAN_BASE__ = basePath
    win.__LIVE_PLAN_HOST__ = host
    if (transport) win.__LIVE_PLAN_TRANSPORT__ = transport
    else delete win.__LIVE_PLAN_TRANSPORT__
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      document.documentElement.dataset.theme = media.matches ? 'dark' : 'light'
    }
    applyTheme()
    media.addEventListener('change', applyTheme)
    bindPlanChrome()
    if (!started.current) {
      started.current = true
      void import('../client/planMdx.tsx')
      void import('../client/main.tsx')
      void import('../client/chrome/mountChrome.tsx')
      if (host === 'cloud') void import('../client/PlanSelector.tsx')
    }
    // Code blocks and the canvas read these once. Announce them so a fresh loader result
    // (after a theme is saved in Settings) reaches components that are already mounted.
    window.dispatchEvent(new CustomEvent('living-plan-theme', { detail: { accent, pageWidth, diffsTheme, wrapCode } }))
    const sourceFlags = planSourceFlags(source)
    if (sourceFlags.mermaid) void import('../client/mermaid.ts')
    if (sourceFlags.code) void import('../client/highlight.tsx')
    return () => media.removeEventListener('change', applyTheme)
  }, [accent, basePath, diffsTheme, host, mode, pageWidth, source, transport, wrapCode])

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      <style>{hostToolbarCss}</style>
      <header className="titlebar">
        <div className="plan-details" data-plan-details>
          <button
            type="button"
            className="logo-btn"
            data-plan-details-toggle=""
            aria-expanded="false"
            aria-controls="plan-card"
            aria-label="Plan details"
          >
            <img className="titlebar-logo" src="/favicon.png" alt="" width={29} height={29} />
          </button>
          <div className="plan-card" id="plan-card" data-plan-card="" hidden>
            <div className="facts">
              <span className="fact" title={`Mode · ${mode}`}>
                <span className="val">{mode}</span>
              </span>
            </div>
          </div>
        </div>
        <h1 className="brand" id="plan-title">
          {title}
        </h1>
        <div className="chrome-tools">
          <p className="offline-state" data-offline-state="" hidden />
          <div className="tabs" role="tablist" aria-label="Living Plan views">
            <button
              type="button"
              className="tab-btn"
              role="tab"
              data-tab-target="plan"
              aria-selected={tab === 'plan'}
              aria-label="Plan"
              onClick={() => setTab('plan')}
            >
              <FileText size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="tab-btn"
              role="tab"
              data-tab-target="workflow"
              aria-selected={tab === 'workflow'}
              aria-label="Workflow"
              onClick={() => setTab('workflow')}
            >
              <Workflow size={16} aria-hidden="true" />
            </button>
          </div>
          {accountLabel ? (
            <div className="account-menu" data-account-menu="" data-label={accountLabel}>
              <Button type="button" variant="secondary" className="titlebar-user" aria-haspopup="menu" aria-expanded="false">
                {accountLabel}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" className="titlebar-user" nativeButton={false} render={<a href="/login" />}>
              Sign in
            </Button>
          )}
        </div>
      </header>
      <div dangerouslySetInnerHTML={{ __html: tocHtml }} />
      <div className="shell">
        <section className="tab-panel" data-tab-panel="plan" role="tabpanel">
          <main className="stack">
            <div id="plan-mdx-root" />
          </main>
        </section>
        <section className="tab-panel" data-tab-panel="workflow" role="tabpanel" hidden={tab !== 'workflow'}>
          {bootstrap ? (
            <script id="living-plan-bootstrap" type="application/json" dangerouslySetInnerHTML={{ __html: bootstrap }} />
          ) : null}
          <div id="execution-root" />
        </section>
      </div>
      {children}
    </>
  )
}
