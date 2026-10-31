import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import sample from '../../../examples/rate-limit.plan.md?raw'

export const Route = createFileRoute('/local')({
  component: LocalPlanPage,
})

function bootJson(source: string): string {
  return JSON.stringify({
    source,
    title: 'Rate limiting rollout',
    responses: {},
    locked: false,
    snapshots: [],
    headSnapshotId: null,
  }).replaceAll('<', '\\u003c')
}

function LocalPlanPage() {
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const win = window as Window & {
      __LIVE_PLAN_BASE__?: string
      __LIVE_PLAN_TRANSPORT__?: string
      __LIVE_PLAN_HOST__?: string
    }
    win.__LIVE_PLAN_BASE__ = ''
    win.__LIVE_PLAN_HOST__ = 'local'
    delete win.__LIVE_PLAN_TRANSPORT__
    document.body.dataset.planMode = 'watch'
    document.body.dataset.planHost = 'local'
    document.documentElement.dataset.layout = 'default'
    void import('../../../client/planMdx.tsx')
  }, [])

  return (
    <main className="plan-shell">
      <p className="host-strip">
        <strong>Local</strong>
        <span>Same plan page, no account.</span>
        <a href="/login">Sign in to host it</a>
      </p>
      <section data-tab-panel="plan">
        <div id="plan-mdx-root" />
      </section>
      <script type="application/json" id="living-plan-mdx" dangerouslySetInnerHTML={{ __html: bootJson(sample) }} />
      <script type="application/json" id="living-plan-comments" dangerouslySetInnerHTML={{ __html: '[]' }} />
      <script type="application/json" id="living-plan-review" dangerouslySetInnerHTML={{ __html: 'null' }} />
    </main>
  )
}
