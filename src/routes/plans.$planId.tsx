import { createFileRoute, redirect } from '@tanstack/react-router'
import { PlanShell } from '../PlanShell.tsx'
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
      if (result.status === 404) return { found: false as const }
      throw new Error(result.message)
    }
    return { found: true as const, page: result.page }
  },
  component: CloudPlanPage,
})

function jsonScript(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}

function CloudPlanPage() {
  const loaded = Route.useLoaderData()
  const { planId } = Route.useParams()
  if (!loaded.found) {
    return (
      <main className="host-page">
        <section className="card">
          <h1>Plan not found</h1>
          <p>This plan is not on this host.</p>
          <p>
            <a href="/dashboard">Back to dashboard</a>
          </p>
        </section>
      </main>
    )
  }
  const page = loaded.page
  const boot = {
    source: page.source,
    title: page.title,
    responses: page.responses ?? {},
    locked: false,
    snapshots: [],
    headSnapshotId: null,
  }

  return (
    <PlanShell
      title={page.title}
      source={page.source}
      mode={page.mode}
      host="cloud"
      pageWidth={page.pageWidth}
      accent={page.accent}
      diffsTheme={page.diffsTheme}
      wrapCode={page.wrapCode}
      accountLabel={page.owner ? page.name || page.email : undefined}
      basePath={`/plans/${planId}`}
      transport="websocket"
      bootstrap={page.bootstrap}
    >
      <script type="application/json" id="living-plan-mdx" dangerouslySetInnerHTML={{ __html: jsonScript(boot) }} />
      <script type="application/json" id="living-plan-comments" dangerouslySetInnerHTML={{ __html: jsonScript(page.comments ?? []) }} />
      <script type="application/json" id="living-plan-review" dangerouslySetInnerHTML={{ __html: jsonScript(page.review ?? null) }} />
    </PlanShell>
  )
}
