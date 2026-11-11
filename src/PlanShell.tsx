import { Bot, BotOff, ChevronDown, FileText, Workflow } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '../client/ui/button.tsx'
import { DesktopModeSwitch } from './DesktopModeSwitch.tsx'
import { hostToolbarCss } from './hostToolbar.ts'
import { planSourceFlags } from './planMdx/source.ts'
import { buildPlanToc, renderPlanTocHtml } from './planToc.ts'
import { bindPlanChrome } from './bindPlanChrome.ts'
import './planPage.css'
import { themeBootstrapScript } from './themeBootstrap.ts'
import { LOCK_BANNER_TEXT } from './lockBanner.ts'
import { PLAN_STATUS_LABEL, planStatus, workState } from './planStatus.ts'
import type { ExecutionState } from './execution.ts'

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
  /** A saved version number. The page is read-only and does not follow the live plan. */
  version?: number
  /** The signed-in account owns this hosted plan, so the account appearance applies to it. */
  owner?: boolean
  /** A run is live when the page is served. The page then opens with Running and its forms locked. */
  executionActive?: boolean
  /** The review decision when the page is served, for the opening status. */
  reviewDecision?: string
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
  version,
  owner = false,
  executionActive = false,
  reviewDecision,
  children,
}: PlanShellProps) {
  // The status the page opens with. client/planStatusMark.ts keeps it current from then on.
  const openingStatus = planStatus({ mode, decision: reviewDecision ?? null, active: executionActive, work: workState(readExecution(bootstrap)) })
  const openingLabel = PLAN_STATUS_LABEL[openingStatus]
  const started = useRef(false)
  const [tab, setTab] = useState<'plan' | 'workflow'>('plan')
  const cloudPlanId = host === 'cloud' && basePath.startsWith('/plans/') ? (basePath.slice('/plans/'.length).split('/')[0] ?? '') : ''
  const tocHtml = renderPlanTocHtml(buildPlanToc(source))
  const versionsLabel = version ? `Version ${version}` : 'Live'

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
    document.body.dataset.planStatus ??= openingStatus
    if (owner) document.body.dataset.planOwner = 'true'
    else delete document.body.dataset.planOwner
    document.body.classList.remove('layout-default', 'layout-wide', 'layout-full')
    document.body.classList.add(`layout-${pageWidth}`)
    const win = window as Window & {
      __LIVE_PLAN_BASE__?: string
      __LIVE_PLAN_TRANSPORT__?: string
      __LIVE_PLAN_HOST__?: string
      __LIVE_PLAN_VERSION__?: number
    }
    win.__LIVE_PLAN_BASE__ = basePath
    win.__LIVE_PLAN_HOST__ = host
    if (transport) win.__LIVE_PLAN_TRANSPORT__ = transport
    else delete win.__LIVE_PLAN_TRANSPORT__
    if (version) win.__LIVE_PLAN_VERSION__ = version
    else delete win.__LIVE_PLAN_VERSION__
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
      // Comments and review belong to the live plan, not to a saved version.
      if (host === 'cloud' && !version) void import('../client/PlanSelector.tsx')
    }
    // Code blocks and the canvas read these once. Announce them so a fresh loader result reaches mounted ones.
    window.dispatchEvent(new CustomEvent('living-plan-theme', { detail: { accent, pageWidth, diffsTheme, wrapCode } }))
    const sourceFlags = planSourceFlags(source)
    if (sourceFlags.mermaid) void import('../client/mermaid.ts')
    if (sourceFlags.code) void import('../client/highlight.tsx')
    return () => media.removeEventListener('change', applyTheme)
  }, [accent, basePath, diffsTheme, host, mode, pageWidth, owner, source, transport, version, wrapCode])

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      <style>{hostToolbarCss}</style>
      <header className="titlebar">
        <a className="logo-btn" href="/dashboard" aria-label="Dashboard" title="Dashboard">
          <img className="titlebar-logo" src="/favicon.png" alt="" width={29} height={29} />
        </a>
        <h1 className="brand" id="plan-title">
          {title}
        </h1>
        <div className="plan-details" data-plan-details>
          <button
            type="button"
            className="plan-status-chip"
            data-plan-details-toggle=""
            aria-expanded="false"
            aria-controls="plan-card"
            aria-label="Plan details"
          >
            <span className="chip-status" aria-hidden="true" />
            <span className="plan-status-chip-label" data-plan-status-label="">
              {openingLabel}
            </span>
            {/* Hidden until the host says whether an agent is connected. client/planStatusMark.ts sets body[data-agent]. */}
            <span className="chip-agent" data-agent-presence-icon="">
              <Bot aria-hidden="true" data-agent-icon="on" />
              <BotOff aria-hidden="true" data-agent-icon="off" />
            </span>
          </button>
          <div className="plan-card" id="plan-card" data-plan-card="" hidden>
            <div className="facts">
              <span className="fact" data-plan-status-fact="" title="Status">
                <span className="status-dot" aria-hidden="true" />
                <span className="val" data-plan-status-label="">
                  {openingLabel}
                </span>
              </span>
              <span className="sr" data-agent-presence-label="" />
              <span className="fact" title={`Mode · ${mode}`}>
                <span className="val">{mode}</span>
              </span>
            </div>
          </div>
        </div>
        <div className="chrome-tools">
          <p className="offline-state" data-offline-state="" hidden />
          {/* With an account menu, the menu carries the Local and Cloud switch. */}
          {accountLabel ? null : <DesktopModeSwitch host={host} />}
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
          {cloudPlanId ? (
            <div
              className="plan-versions-menu"
              data-plan-versions=""
              data-plan-id={cloudPlanId}
              data-live-href={basePath}
              data-label={versionsLabel}
              data-version={version ? String(version) : undefined}
            >
              <button type="button" className="titlebar-action" aria-label="Plan versions" aria-haspopup="menu" aria-expanded="false">
                {versionsLabel}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </div>
          ) : null}
          {accountLabel ? (
            <div className="account-menu" data-account-menu="" data-label={accountLabel} data-host={host}>
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
        <section className={executionActive ? 'tab-panel plan-locked' : 'tab-panel'} data-tab-panel="plan" role="tabpanel">
          {/* Shown and hidden by client/planStatusMark.ts as the run starts and stops. */}
          <div className="lock-banner" data-lock-banner="" role="status" hidden={!executionActive}>
            {LOCK_BANNER_TEXT}
          </div>
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

/** The embedded execution view, or nothing when it does not parse. */
function readExecution(bootstrap: string | undefined): ExecutionState | null {
  if (!bootstrap) return null
  try {
    return JSON.parse(bootstrap) as ExecutionState
  } catch {
    return null
  }
}
