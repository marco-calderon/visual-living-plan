import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../client/ui/button.tsx'
import { hostToolbarCss } from './hostToolbar.ts'
import { planSourceFlags } from './planMdx/source.ts'
import { buildPlanToc, renderPlanTocHtml } from './planToc.ts'
import { planPageStyles } from './planPageStyles.ts'
import { bindPlanChrome } from './bindPlanChrome.ts'
import { themeBootstrapScript } from './themeBootstrap.ts'

const PLAN_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>'
const WORKFLOW_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/></svg>'

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
    if (planSourceFlags(source).code) void import('../client/highlight.tsx')
    return () => media.removeEventListener('change', applyTheme)
  }, [accent, basePath, diffsTheme, host, mode, pageWidth, source, transport, wrapCode])

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      <style>{`${hostToolbarCss}\n${planPageStyles}`}</style>
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
          <div className="tabs" role="tablist" aria-label="Living Plan views">
            <button
              type="button"
              className="tab-btn"
              role="tab"
              data-tab-target="plan"
              aria-selected={tab === 'plan'}
              aria-label="Plan"
              onClick={() => setTab('plan')}
              dangerouslySetInnerHTML={{ __html: PLAN_ICON }}
            />
            <button
              type="button"
              className="tab-btn"
              role="tab"
              data-tab-target="workflow"
              aria-selected={tab === 'workflow'}
              aria-label="Workflow"
              onClick={() => setTab('workflow')}
              dangerouslySetInnerHTML={{ __html: WORKFLOW_ICON }}
            />
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
