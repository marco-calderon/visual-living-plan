import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { loadPlan } from '../planFns.ts'

export const Route = createFileRoute('/plans/$planId')({
  loader: async ({ params }) => {
    const result = await loadPlan({ data: params.planId })
    if (!result.ok) {
      if (result.status === 401) {
        throw redirect({
          to: '/login',
          search: { next: `/plans/${params.planId}` },
        })
      }
      throw new Error(result.message)
    }
    return result.page
  },
  component: CloudPlanPage,
})

function jsonScript(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

function CloudPlanPage() {
  const page = Route.useLoaderData()
  const { planId } = Route.useParams()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const win = window as Window & {
      __LIVE_PLAN_BASE__?: string
      __LIVE_PLAN_TRANSPORT__?: string
      __LIVE_PLAN_HOST__?: string
    }
    win.__LIVE_PLAN_BASE__ = `/plans/${planId}`
    win.__LIVE_PLAN_TRANSPORT__ = 'websocket'
    win.__LIVE_PLAN_HOST__ = 'cloud'
    document.body.dataset.planMode = page.mode
    document.body.dataset.planHost = 'cloud'
    document.body.dataset.accent = page.accent
    document.documentElement.dataset.layout = page.pageWidth
    document.documentElement.dataset.diffsTheme = page.diffsTheme
    document.documentElement.dataset.wrapCode = page.wrapCode ? 'true' : 'false'
    void import('../../../client/planMdx.tsx')
    void import('../../../client/PlanSelector.tsx')
  }, [page, planId])

  const boot = {
    source: page.source,
    title: page.title,
    responses: page.responses ?? {},
    locked: false,
    snapshots: [],
    headSnapshotId: null,
  }

  return (
    <main className="plan-shell">
      <p className="host-strip">
        <strong>Cloud</strong>
        <span>{page.owner ? `Signed in as ${page.email}` : 'Shared review link'}</span>
        <a href="/dashboard">Dashboard</a>
        <a href="/local">Without an account</a>
      </p>
      <section data-tab-panel="plan">
        <div id="plan-mdx-root" />
      </section>
      <script type="application/json" id="living-plan-mdx" dangerouslySetInnerHTML={{ __html: jsonScript(boot) }} />
      <script type="application/json" id="living-plan-comments" dangerouslySetInnerHTML={{ __html: jsonScript(page.comments ?? []) }} />
      <script type="application/json" id="living-plan-review" dangerouslySetInnerHTML={{ __html: jsonScript(page.review ?? null) }} />
    </main>
  )
}
