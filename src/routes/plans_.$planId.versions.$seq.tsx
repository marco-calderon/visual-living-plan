import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { PlanShell } from '../PlanShell.tsx'
import { loadPlanVersion } from '../planFns.ts'
import { rememberPlanVersion } from '../../client/offline/versions.ts'

/** A saved version of a plan. The same renderer as the live plan, read-only and not connected to the live stream. */
export const Route = createFileRoute('/plans_/$planId/versions/$seq')({
  loader: async ({ params }) => {
    const result = await loadPlanVersion({ data: { planId: params.planId, seq: params.seq } })
    if (!result.ok) {
      if (result.status === 401) {
        throw redirect({
          to: '/login',
          search: { next: `/plans/${params.planId}/versions/${params.seq}` },
        })
      }
      throw new Error(result.message)
    }
    return result.page
  },
  component: PlanVersionPage,
})

function jsonScript(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

function PlanVersionPage() {
  const page = Route.useLoaderData()
  const { planId } = Route.useParams()
  const boot = {
    source: page.source,
    title: page.title,
    responses: {},
    locked: true,
    snapshots: [],
    headSnapshotId: null,
    version: page.seq,
  }

  useEffect(() => {
    void rememberPlanVersion({
      planId,
      seq: page.seq,
      title: page.title,
      source: page.source,
      createdAt: page.createdAt,
    })
  }, [planId, page.seq, page.title, page.source, page.createdAt])

  return (
    <PlanShell
      title={page.title}
      source={page.source}
      mode="watch"
      host="cloud"
      pageWidth={page.pageWidth}
      accent={page.accent}
      diffsTheme={page.diffsTheme}
      wrapCode={page.wrapCode}
      accountLabel={page.name || page.email}
      basePath={`/plans/${planId}`}
      bootstrap={page.bootstrap}
      version={page.seq}
    >
      <script type="application/json" id="living-plan-mdx" dangerouslySetInnerHTML={{ __html: jsonScript(boot) }} />
      <script type="application/json" id="living-plan-comments" dangerouslySetInnerHTML={{ __html: '[]' }} />
      <script type="application/json" id="living-plan-review" dangerouslySetInnerHTML={{ __html: 'null' }} />
    </PlanShell>
  )
}
